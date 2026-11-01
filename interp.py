"""
Table interpolation schemes in logarithmic variables x=ln n, y=ln T.

Every scheme exposes  .eval(x, y, deriv=False)  ->  dict(P, e [, Px, Py, ex, ey])
with per-nucleon pressure P [eV/cm^3] (i.e. energy density), energy e [eV], and the
log-derivatives Px=dP/dx, Py=dP/dy, ex=de/dx, ey=de/dy.

M1  LogBilinear   : bilinear interpolation of ln P and ln e (independent)
M2  LogSpline     : bicubic spline (C2) of ln P and ln e (independent)
M3  HermiteF(m=1) : bicubic Hermite interpolation of phi=f/T from analytic nodal
                    data (f, f_x, f_y, f_xy)                      [consistent]
M4  HermiteF(m=1) : same interpolant, but nodal data reconstructed from P and e tables only
                    (this work)                                    [consistent]
M5  HermiteF(m=2) : biquintic Hermite free-energy interpolation (Timmes-Swesty-like)
                    [consistent]
"""
import numpy as np
from scipy.interpolate import RectBivariateSpline


class Grid:
    def __init__(self, x0, y0, hx, hy, nx, ny):
        self.x0, self.y0, self.hx, self.hy, self.nx, self.ny = x0, y0, hx, hy, nx, ny
        self.xs = x0 + hx * np.arange(nx)
        self.ys = y0 + hy * np.arange(ny)

    def locate(self, x, y):
        u = (np.asarray(x) - self.x0) / self.hx
        v = (np.asarray(y) - self.y0) / self.hy
        i = np.clip(np.floor(u).astype(int), 0, self.nx - 2)
        j = np.clip(np.floor(v).astype(int), 0, self.ny - 2)
        return i, j, u - i, v - j


# ------------------------------------------------------------------ M1
class LogBilinear:
    name = 'LB'

    def __init__(self, grid, P, e):
        self.g = grid
        self.lP, self.le = np.log(P), np.log(e)

    @staticmethod
    def _bil(F, i, j, t, s, dx=0, dy=0, hx=1.0, hy=1.0):
        f00, f10, f01, f11 = F[i, j], F[i + 1, j], F[i, j + 1], F[i + 1, j + 1]
        if dx == 0 and dy == 0:
            return (1 - t) * (1 - s) * f00 + t * (1 - s) * f10 + (1 - t) * s * f01 + t * s * f11
        if dx == 1 and dy == 0:
            return ((f10 - f00) * (1 - s) + (f11 - f01) * s) / hx
        if dx == 0 and dy == 1:
            return ((f01 - f00) * (1 - t) + (f11 - f10) * t) / hy
        raise ValueError

    def eval(self, x, y, deriv=False):
        g = self.g
        i, j, t, s = g.locate(x, y)
        P = np.exp(self._bil(self.lP, i, j, t, s))
        e = np.exp(self._bil(self.le, i, j, t, s))
        out = dict(P=P, e=e)
        if deriv:
            out['Px'] = P * self._bil(self.lP, i, j, t, s, 1, 0, g.hx, g.hy)
            out['Py'] = P * self._bil(self.lP, i, j, t, s, 0, 1, g.hx, g.hy)
            out['ex'] = e * self._bil(self.le, i, j, t, s, 1, 0, g.hx, g.hy)
            out['ey'] = e * self._bil(self.le, i, j, t, s, 0, 1, g.hx, g.hy)
        return out


# ------------------------------------------------------------------ M2
class LogSpline:
    name = 'LS'

    def __init__(self, grid, P, e):
        self.sP = RectBivariateSpline(grid.xs, grid.ys, np.log(P), kx=3, ky=3, s=0)
        self.se = RectBivariateSpline(grid.xs, grid.ys, np.log(e), kx=3, ky=3, s=0)

    def eval(self, x, y, deriv=False):
        x = np.asarray(x); y = np.asarray(y)
        P = np.exp(self.sP.ev(x, y)); e = np.exp(self.se.ev(x, y))
        out = dict(P=P, e=e)
        if deriv:
            out['Px'] = P * self.sP.ev(x, y, dx=1)
            out['Py'] = P * self.sP.ev(x, y, dy=1)
            out['ex'] = e * self.se.ev(x, y, dx=1)
            out['ey'] = e * self.se.ev(x, y, dy=1)
        return out


# ------------------------------------------------------------------ Hermite
_POLY = {
    1: {(0, 0): [1, 0, -3, 2], (1, 0): [0, 1, -2, 1], (0, 1): [0, 0, 3, -2], (1, 1): [0, 0, -1, 1]},
    2: {(0, 0): [1, 0, 0, -10, 15, -6], (1, 0): [0, 1, 0, -6, 8, -3], (2, 0): [0, 0, .5, -1.5, 1.5, -.5],
        (0, 1): [0, 0, 0, 10, -15, 6], (1, 1): [0, 0, 0, -4, 7, -3], (2, 1): [0, 0, 0, .5, -1, .5]},
}


def _polyder_eval(c, r, t):
    c = np.array(c, float)
    for _ in range(r):
        c = np.polynomial.polynomial.polyder(c) if len(c) > 1 else np.zeros(1)
    return np.polynomial.polynomial.polyval(t, c)


class HermiteF:
    """Tensor-product Hermite interpolation of phi=f/T (cubic m=1, quintic m=2).

    Per-cell monomial coefficients are precomputed, so a lookup is one gather and one contraction."""

    def __init__(self, grid, D, m, name):
        self.g, self.D, self.m, self.name = grid, D, m, name
        self.ka = 2 * (m + 1)
        g = grid
        nx, ny = g.nx - 1, g.ny - 1
        C = np.zeros((nx, ny, self.ka, self.ka))
        poly = _POLY[m]
        for si in (0, 1):
            for sj in (0, 1):
                for p in range(m + 1):
                    for q in range(m + 1):
                        data = D[(p, q)][si:si + nx, sj:sj + ny] * (g.hx ** p) * (g.hy ** q)
                        cx = np.array(poly[(p, si)], float); cy = np.array(poly[(q, sj)], float)
                        C += data[:, :, None, None] * cx[None, None, :, None] * cy[None, None, None, :]
        self.C = C
        k = np.arange(self.ka)
        self._fall = {r: np.array([np.prod([a - t for t in range(r)]) if a >= r else 0.0 for a in k]) for r in range(3)}
        self._sh = {r: np.maximum(k - r, 0) for r in range(3)}

    def _pw(self, t, r):
        return self._fall[r][None, :] * t[:, None] ** self._sh[r][None, :]

    def _multi(self, x, y, orders):
        g = self.g
        x = np.atleast_1d(x); y = np.atleast_1d(y)
        i, j, t, s = g.locate(x, y)
        Cg = self.C[i, j]
        res = {}
        pu = {r: self._pw(t, r) for r in set(o[0] for o in orders)}
        pv = {r: self._pw(s, r) for r in set(o[1] for o in orders)}
        for (rx, ry) in orders:
            res[(rx, ry)] = np.einsum('nab,na,nb->n', Cg, pu[rx], pv[ry]) / (g.hx ** rx * g.hy ** ry)
        return res

    def eval(self, x, y, deriv=False):
        # interpolated potential is phi = f/T:  P = n T phi_x ,  e = -T phi_y
        x = np.asarray(x); y = np.asarray(y)
        n = np.exp(x); T = np.exp(y)
        if not deriv:
            r = self._multi(x, y, [(1, 0), (0, 1)])
            return dict(P=n * T * r[(1, 0)], e=-T * r[(0, 1)])
        r = self._multi(x, y, [(1, 0), (0, 1), (2, 0), (1, 1), (0, 2)])
        px, py, pxx, pxy, pyy = [r[k] for k in [(1, 0), (0, 1), (2, 0), (1, 1), (0, 2)]]
        P = n * T * px; e = -T * py
        return dict(P=P, e=e, Px=P + n * T * pxx, Py=P + n * T * pxy, ex=-T * pxy, ey=e - T * pyy)


# -------------------------------------------- M4: reconstruct nodal data from P, e tables
def _lagrange_weights(npts, kind, pos):
    """Weights on stencil nodes 0..npts-1 (unit spacing).
    kind='int': integral over [pos,pos+1];  kind='der': derivative at node pos."""
    w = np.zeros(npts)
    for a in range(npts):
        c = np.polynomial.polynomial.Polynomial([1.0])
        for b in range(npts):
            if b != a:
                c = c * np.polynomial.polynomial.Polynomial([-b, 1.0]) / (a - b)
        if kind == 'int':
            ci = c.integ()
            w[a] = ci(pos + 1) - ci(pos)
        else:
            w[a] = c.deriv()(pos)
    return w


def _cumint(g, h, axis, npts=8):
    """Cumulative integral of nodal samples (uniform spacing h) with an npts-point Lagrange rule per cell."""
    g = np.moveaxis(g, axis, 0)
    N = g.shape[0]
    cell = np.zeros((N - 1,) + g.shape[1:])
    for k in range(N - 1):
        s0 = int(np.clip(k - (npts // 2 - 1), 0, N - npts))
        w = _lagrange_weights(npts, 'int', k - s0)
        cell[k] = np.tensordot(w, g[s0:s0 + npts], axes=(0, 0))
    out = np.zeros_like(g)
    out[1:] = np.cumsum(cell, axis=0) * h
    return np.moveaxis(out, 0, axis)


def _deriv(g, h, axis, npts=8):
    """First derivative at the nodes with an npts-point Lagrange stencil (one-sided near the edges)."""
    g = np.moveaxis(g, axis, 0)
    N = g.shape[0]
    d = np.zeros_like(g)
    for k in range(N):
        s0 = int(np.clip(k - npts // 2, 0, N - npts))
        w = _lagrange_weights(npts, 'der', k - s0)
        d[k] = np.tensordot(w, g[s0:s0 + npts], axes=(0, 0))
    return np.moveaxis(d / h, 0, axis)


def reconstruct_from_PE(grid, P, e, npts=10, level=1):
    """Thermodynamically consistent nodal free-energy data from tabulated P(n,T) and e(n,T) only.

    Works with the dimensionless free energy phi = f/T:  phi_x = P/(nT),  phi_y = -e/T  (exact at
    nodes).  phi is obtained by integrating phi_y along y on the lowest-density column and phi_x
    along x for every temperature; phi_xy = d(phi_x)/dy by 4th-order differences.
    """
    X, Y = np.meshgrid(grid.xs, grid.ys, indexing='ij')
    n, T = np.exp(X), np.exp(Y)
    phx = P / (n * T)
    phy = -e / T
    phi0 = _cumint(phy[0, :][None, :], grid.hy, 1, npts)[0]                # phi on reference column
    phi = phi0[None, :] + _cumint(phx, grid.hx, 0, npts)
    phxy = _deriv(phx, grid.hy, 1, npts)
    D = {(0, 0): phi, (1, 0): phx, (0, 1): phy, (1, 1): phxy}
    if level >= 2:
        D[(2, 0)] = _deriv(phx, grid.hx, 0, npts)
        D[(0, 2)] = _deriv(phy, grid.hy, 1, npts)
        D[(2, 1)] = _deriv(phxy, grid.hx, 0, npts)
        D[(1, 2)] = _deriv(phxy, grid.hy, 1, npts)
        D[(2, 2)] = _deriv(D[(1, 2)], grid.hx, 0, npts)
    return D


class AddRad:
    """Wrap a matter-only interpolant and add the analytic blackbody term (P_r = a T^4/3, e_r = a T^4/n)."""

    def __init__(self, inner, arad):
        self.inner, self.A, self.name = inner, arad, inner.name

    def eval(self, x, y, deriv=False):
        o = self.inner.eval(x, y, deriv)
        x = np.asarray(x); y = np.asarray(y)
        Pr = self.A * np.exp(4 * y) / 3.0
        er = self.A * np.exp(4 * y - x)
        o = dict(o)
        o['P'] = o['P'] + Pr
        o['e'] = o['e'] + er
        if deriv:
            o['Py'] = o['Py'] + 4 * Pr
            o['ex'] = o['ex'] - er
            o['ey'] = o['ey'] + 4 * er
        return o
