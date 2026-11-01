"""
Reference ("exact") model equation of state used as ground truth.

Fully ionised hydrogen (Z=1, A=1), per-nucleon quantities, units: eV and cm.
Free energy per nucleon  f(x,y),  x = ln n [cm^-3],  y = ln T [eV]:

  f = T[ln(n lam_i^3 / 2) - 1]            ideal classical protons
    + T f_ex(Gamma)                        ion-ion correlation (OCP, smooth fit)
    + T eta - P_e/n                        ideal Fermi-Dirac electrons
    - P_r/n                                blackbody radiation

All first derivatives (P, e, entropy) and the mixed derivative f_xy are analytic.
"""
import numpy as np
from scipy.integrate import quad
from scipy.interpolate import CubicSpline
import sympy as sp

# ---------------------------------------------------------------- constants
MEC2 = 510998.95          # eV
MPC2 = 938.27209e6        # eV
HBARC = 1.973269804e-5    # eV cm
ALPHA = 1.0 / 137.035999084
E2 = ALPHA * HBARC        # e^2, eV cm
MP_G = 1.67262192e-24     # g
EV_ERG = 1.602176634e-12  # erg per eV
EVCM3_PA = 1.602176634e-13  # Pa per (eV/cm^3)
A_RAD = (np.pi ** 2 / 15.0) / HBARC ** 3   # u_rad = A_RAD * T^4  [eV/cm^3]
C_E = (np.sqrt(2.0) / np.pi ** 2) * (MEC2 / HBARC ** 2) ** 1.5  # n_e = C_E T^1.5 I_{1/2}

# ------------------------------------------------- OCP excess free energy
_G = sp.symbols('G', positive=True)
_A1, _A2 = -0.9052, 0.6322          # Chabrier & Potekhin, PRE 58, 4941 (1998), Eq. (28)
_A3 = -sp.sqrt(3) / 2 - _A1 / sp.sqrt(_A2)
_fex = (_A1 * (sp.sqrt(_G * (_A2 + _G)) - _A2 * sp.log(sp.sqrt(_G / _A2) + sp.sqrt(1 + _G / _A2)))
        + 2 * _A3 * (sp.sqrt(_G) - sp.atan(sp.sqrt(_G))))
_fp = sp.diff(_fex, _G)
_g = _G * _fp / 3
_gp = sp.diff(_g, _G)
fex = sp.lambdify(_G, _fex, 'numpy')
fex_p = sp.lambdify(_G, _fp, 'numpy')
gfun = sp.lambdify(_G, _g, 'numpy')
gfun_p = sp.lambdify(_G, _gp, 'numpy')

# ------------------------------------------------ Fermi-Dirac integrals
_K = {-0.5: 0, 0.5: 1, 1.5: 2}


def _fd_quad(k, eta):
    # I_k(eta) = int_0^inf x^k /(exp(x-eta)+1) dx, substitution x=t^2
    f = lambda t: 2.0 * t ** (2 * k + 1) / (np.exp(min(t * t - eta, 700.0)) + 1.0)
    tF = np.sqrt(max(eta, 0.0))
    tmax = np.sqrt(max(eta, 0.0) + 80.0)
    pts = [tF] if 0 < tF < tmax else None
    val, _ = quad(f, 0.0, tmax, points=pts, limit=400, epsabs=0, epsrel=1e-13)
    return val


def _build_fd():
    eg = np.concatenate([np.arange(-20.0, 40.0, 0.01), np.arange(40.0, 450.0001, 0.05)])
    out = {}
    for k in (-0.5, 0.5, 1.5):
        L = np.array([np.log(_fd_quad(k, e)) for e in eg])
        out[k] = CubicSpline(eg, L)
    return eg, out


import os, pickle
_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fd_cache.pkl')
if os.path.exists(_cache):
    _EG, _SP = pickle.load(open(_cache, 'rb'))
else:
    _EG, _SP = _build_fd()
    pickle.dump((_EG, _SP), open(_cache, 'wb'))
_LGRID = _SP[0.5](_EG)
from math import gamma as _gm


def Ik(k, eta):
    eta = np.asarray(eta, float)
    lo = eta < -20.0
    res = np.exp(_SP[k](np.clip(eta, -20.0, 450.0)))
    if np.any(lo):
        e = np.exp(eta[lo]) if eta.ndim else np.exp(eta)
        ser = _gm(k + 1) * (e - e ** 2 / 2 ** (k + 1) + e ** 3 / 3 ** (k + 1))
        res = np.where(lo, 0.0, res)
        res = np.asarray(res)
        res[lo] = ser
    return res


def eta_of(n, T):
    """Electron degeneracy parameter eta=mu/kT for electron density n at T."""
    Lt = np.log(n / (C_E * T ** 1.5))
    eta = np.interp(Lt, _LGRID, _EG)
    for _ in range(4):
        L = _SP[0.5](np.clip(eta, -20, 450))
        dL = _SP[-0.5](np.clip(eta, -20, 450)) - L - np.log(2.0)   # ln(I_{-1/2}/(2 I_{1/2}))
        eta = eta - (L - Lt) / np.exp(dL)
    return eta


# ------------------------------------------------------- the EOS itself
def eos(x, y):
    """Return dict of analytic per-nucleon quantities at (x=ln n, y=ln T)."""
    x = np.asarray(x, float); y = np.asarray(y, float)
    n = np.exp(x); T = np.exp(y)
    eta = eta_of(n, T)
    I12, Im12, I32 = Ik(0.5, eta), Ik(-0.5, eta), Ik(1.5, eta)
    Pe_n = (2.0 / 3.0) * T * I32 / I12            # P_e / n
    Pr_n = A_RAD * T ** 4 / (3.0 * n)             # P_r / n
    a_i = (3.0 / (4.0 * np.pi * n)) ** (1.0 / 3.0)
    Gam = E2 / (a_i * T)
    lam3 = (2.0 * np.pi * HBARC ** 2 / (MPC2 * T)) ** 1.5
    g = gfun(Gam); gp = gfun_p(Gam)
    f = (T * (np.log(n * lam3 / 2.0) - 1.0) + T * fex(Gam) + T * eta - Pe_n - Pr_n)
    fx = T + T * g + Pe_n + Pr_n                       # = P/n
    e = 1.5 * T + 3.0 * T * g + 1.5 * Pe_n + 3.0 * Pr_n
    fy = f - e
    R = I32 / I12
    Rp = 1.5 - 0.5 * I32 * Im12 / I12 ** 2
    deta = -3.0 * I12 / Im12
    fxy = T * (1.0 + g - Gam * gp) + (2.0 / 3.0) * T * R + (2.0 / 3.0) * T * Rp * deta + 4.0 * Pr_n
    return dict(f=f, fx=fx, fy=fy, fxy=fxy, e=e, P=n * fx, n=n, T=T, eta=eta, Gam=Gam,
                Pe_n=Pe_n, Pr_n=Pr_n, Pion_n=T * (1 + g))


def d1(fun, x, y, axis, d=0.02):
    """6th-order central derivative of fun(x,y) along axis (0=x,1=y)."""
    c = np.array([-1, 9, -45, 0, 45, -9, 1]) / 60.0
    s = np.arange(-3, 4)
    acc = 0.0
    for ci, si in zip(c, s):
        if ci == 0:
            continue
        acc = acc + ci * (fun(x + si * d * (axis == 0), y + si * d * (axis == 1)))
    return acc / d


def eos_nodal(x, y, level=1):
    """Nodal Hermite data. level=1: f,fx,fy,fxy.  level=2 adds fxx,fyy,fxxy,fxyy,fxxyy (6th-order FD)."""
    r = eos(x, y)
    D = {(0, 0): r['f'], (1, 0): r['fx'], (0, 1): r['fy'], (1, 1): r['fxy']}
    if level >= 2:
        fxf = lambda a, b: eos(a, b)['fx']
        fyf = lambda a, b: eos(a, b)['fy']
        fxyf = lambda a, b: eos(a, b)['fxy']
        D[(2, 0)] = d1(fxf, x, y, 0)
        D[(0, 2)] = d1(fyf, x, y, 1)
        D[(2, 1)] = d1(fxyf, x, y, 0)
        D[(1, 2)] = d1(fxyf, x, y, 1)
        inner = lambda a, b: d1(fxyf, a, b, 1)
        D[(2, 2)] = d1(inner, x, y, 0)
    return D


def eos_second(x, y):
    """Reference second derivatives fxx, fyy (FD of analytic first derivatives)."""
    fxx = d1(lambda a, b: eos(a, b)['fx'], x, y, 0, d=0.01)
    fyy = d1(lambda a, b: eos(a, b)['fy'], x, y, 1, d=0.01)
    return fxx, fyy


def rho_to_x(rho):
    return np.log(np.asarray(rho) / MP_G)


def x_to_rho(x):
    return np.exp(x) * MP_G


def phi_funcs():
    """Dimensionless free energy phi=f/T and its analytic derivatives (x=ln n, y=ln T)."""
    ph = lambda a, b: (lambda r: r['f'] / r['T'])(eos(a, b))
    phx = lambda a, b: (lambda r: r['fx'] / r['T'])(eos(a, b))
    phy = lambda a, b: (lambda r: -r['e'] / r['T'])(eos(a, b))
    phxy = lambda a, b: (lambda r: (r['fxy'] - r['fx']) / r['T'])(eos(a, b))
    return ph, phx, phy, phxy


def phi_nodal(x, y, level=1):
    ph, phx, phy, phxy = phi_funcs()
    D = {(0, 0): ph(x, y), (1, 0): phx(x, y), (0, 1): phy(x, y), (1, 1): phxy(x, y)}
    if level >= 2:
        D[(2, 0)] = d1(phx, x, y, 0)
        D[(0, 2)] = d1(phy, x, y, 1)
        D[(2, 1)] = d1(phxy, x, y, 0)
        D[(1, 2)] = d1(phxy, x, y, 1)
        D[(2, 2)] = d1(lambda a, b: d1(phxy, a, b, 1), x, y, 0)
    return D


def phi_second(x, y):
    """Reference second derivatives phi_xx, phi_yy (FD of analytic first derivatives)."""
    ph, phx, phy, phxy = phi_funcs()
    return d1(phx, x, y, 0, d=0.01), d1(phy, x, y, 1, d=0.01)
