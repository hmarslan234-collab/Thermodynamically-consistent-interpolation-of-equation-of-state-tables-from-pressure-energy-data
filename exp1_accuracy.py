import numpy as np, json, time
import eos as E, tables as T
from interp import *

PPDS = [5, 10, 20, 40]
METHODS = ['LB', 'LS', 'HC', 'HQ', 'RC', 'RQ']
X1 = T.X0 + 4 * np.log(10); Y1 = T.Y0 + 3 * np.log(10)


class Ref:
    """Exact model EOS with the same eval() interface as the interpolants."""
    name = 'REF'

    def eval(self, x, y, deriv=False):
        x = np.asarray(x, float); y = np.asarray(y, float)
        r = E.eos(x, y)
        n, Tt = r['n'], r['T']
        px = r['fx'] / Tt
        py = -r['e'] / Tt
        P = r['P']; e = r['e']
        out = dict(P=P, e=e)
        if deriv:
            pxy = (r['fxy'] - r['fx']) / Tt
            pxx, pyy = E.phi_second(x, y)
            out.update(Px=P + n * Tt * pxx, Py=P + n * Tt * pxy, ex=-Tt * pxy, ey=e - Tt * pyy)
        return out


REF = Ref()


def cs2(o, n):
    return o['Px'] / n + o['Py'] ** 2 / (n ** 2 * o['ey'])


def stats(a):
    a = np.abs(a)
    return dict(med=float(np.median(a)), p99=float(np.percentile(a, 99)), max=float(a.max()))


def gl_pieces(a, b, nodes, ng=6):
    """Gauss-Legendre points/weights on [a,b], split at grid nodes lying inside (a,b)."""
    xi, wi = np.polynomial.legendre.leggauss(ng)
    br = np.concatenate([[a], nodes[(nodes > a) & (nodes < b)], [b]])
    pts, wts = [], []
    for lo, hi in zip(br[:-1], br[1:]):
        pts.append(0.5 * (hi - lo) * xi + 0.5 * (hi + lo)); wts.append(0.5 * (hi - lo) * wi)
    return np.concatenate(pts), np.concatenate(wts)


def edge_integrals(m, g, xa, xb, ya, yb):
    """Return the four edge integrals of d(entropy)/k around the rectangle (counter-clockwise)."""
    def horiz(y, a, b):
        px, w = gl_pieces(a, b, g.xs)
        o = m.eval(px, np.full_like(px, y), True)
        n = np.exp(px); Tt = np.exp(y)
        return float(np.sum(w * (o['ex'] - o['P'] / n) / Tt))

    def vert(x, a, b):
        py, w = gl_pieces(a, b, g.ys)
        o = m.eval(np.full_like(py, x), py, True)
        Tt = np.exp(py)
        return float(np.sum(w * o['ey'] / Tt))
    return [horiz(ya, xa, xb), vert(xb, ya, yb), -horiz(yb, xa, xb), -vert(xa, ya, yb)]


def make_loops(nl=40, seed=3):
    rng = np.random.default_rng(seed)
    L = []
    while len(L) < nl:
        w = rng.uniform(1.5, 8.0); h = rng.uniform(1.0, 6.0)
        xa = rng.uniform(T.X0 + 0.03, X1 - w - 0.03); ya = rng.uniform(T.Y0 + 0.03, Y1 - h - 0.03)
        L.append((xa, xa + w, ya, ya + h))
    return L


def closure_stats(m, g, loops):
    out = []
    for (xa, xb, ya, yb) in loops:
        ed = edge_integrals(m, g, xa, xb, ya, yb)
        out.append(abs(sum(ed)) / sum(abs(v) for v in ed))
    return np.array(out)


def main():
    rng = np.random.default_rng(0)
    NT = 20000
    x = rng.uniform(T.X0 + 1e-6, X1 - 1e-6, NT); y = rng.uniform(T.Y0 + 1e-6, Y1 - 1e-6, NT)
    n = np.exp(x)
    ref = REF.eval(x, y, True)
    cs_ref = cs2(ref, n)
    res = {'domain': {}, 'acc': {}, 'cons': {}, 'closure_ref': None, 'time': {}, 'orders': {}}

    # domain statistics (for Table 1)
    xs = np.linspace(T.X0, X1, 161); ys = np.linspace(T.Y0, Y1, 121)
    XX, YY = np.meshgrid(xs, ys, indexing='ij')
    r = E.eos(XX, YY)
    Ppa = r['P'] * E.EVCM3_PA
    res['domain'] = dict(
        Gam_min=float(r['Gam'].min()), Gam_max=float(r['Gam'].max()),
        eta_min=float(r['eta'].min()), eta_max=float(r['eta'].max()),
        P_min_Pa=float(Ppa.min()), P_max_Pa=float(Ppa.max()),
        u_min_Jm3=float((r['n'] * r['e']).min() * E.EVCM3_PA),
        rad_max=float((r['Pr_n'] / r['fx']).max()),
        frac_Gam_gt1=float((r['Gam'] > 1).mean()), frac_deg=float((r['eta'] > 0).mean()),
        frac_rad50=float(((r['Pr_n'] / r['fx']) > 0.5).mean()))
    # sanity of reference: Maxwell and stability
    rM = np.abs(ref['ex'] - (ref['P'] - ref['Py']) / n) / (ref['P'] / n)
    res['ref_maxwell_max'] = float(rM.max())
    res['ref_stab_viol'] = int(((ref['Px'] <= 0) | (ref['ey'] <= 0)).sum())

    loops = make_loops()
    gref = T.make_grid(10)
    cl_ref = closure_stats(REF, gref, loops)
    res['closure_ref'] = dict(med=float(np.median(cl_ref)), max=float(cl_ref.max()))
    print('ref maxwell', res['ref_maxwell_max'], 'closure ref', res['closure_ref'], flush=True)

    for rad in ('sub', 'full'):
        for ppd in PPDS:
            g, M, P, e = T.build(ppd, rad)
            for k in METHODS:
                o = M[k].eval(x, y, True)
                key = f'{rad}|{ppd}|{k}'
                res['acc'][key] = dict(P=stats(o['P'] / ref['P'] - 1), e=stats(o['e'] / ref['e'] - 1),
                                       cs2=stats(cs2(o, n) / cs_ref - 1))
                rMk = np.abs(o['ex'] - (o['P'] - o['Py']) / n) / (o['P'] / n)
                viol = int(((o['Px'] <= 0) | (o['ey'] <= 0)).sum())
                cl = closure_stats(M[k], g, loops)
                res['cons'][key] = dict(maxwell=stats(rMk), viol=viol,
                                        closure=dict(med=float(np.median(cl)), max=float(cl.max())))
            print(rad, ppd, 'done', flush=True)

    # observed orders (median and max error, ppd 10 -> 40)
    for rad in ('sub', 'full'):
        for k in METHODS:
            for q in ('P', 'e'):
                for s in ('med', 'max'):
                    a10 = res['acc'][f'{rad}|10|{k}'][q][s]; a40 = res['acc'][f'{rad}|40|{k}'][q][s]
                    res['orders'][f'{rad}|{k}|{q}|{s}'] = float(np.log(a10 / a40) / np.log(4.0))
            m10 = res['cons'][f'{rad}|10|{k}']['maxwell']['med']; m40 = res['cons'][f'{rad}|40|{k}']['maxwell']['med']
            res['orders'][f'{rad}|{k}|maxwell|med'] = float(np.log(max(m10, 1e-300) / max(m40, 1e-300)) / np.log(4.0))

    # timing (sub tables, ppd=20): 1e6 random points, P and e only
    g, M, P, e = T.build(20, 'sub')
    xr = rng.uniform(T.X0, X1, 1_000_000); yr = rng.uniform(T.Y0, Y1, 1_000_000)
    for k in METHODS:
        best = 1e9
        for _ in range(3):
            t0 = time.perf_counter(); M[k].eval(xr, yr); best = min(best, time.perf_counter() - t0)
        res['time'][k] = best
    tref = time.perf_counter(); E.eos(xr[:100000], yr[:100000]); res['time']['REF_per_1e6'] = (time.perf_counter() - tref) * 10

    # error maps at ppd=10 (sub), P and e
    g, M, P, e = T.build(10, 'sub')
    fx_ = np.linspace(T.X0, X1, 241) + 0.37 * (X1 - T.X0) / 240
    fy_ = np.linspace(T.Y0, Y1, 181) + 0.37 * (Y1 - T.Y0) / 180
    fx_ = np.clip(fx_, T.X0, X1 - 1e-6); fy_ = np.clip(fy_, T.Y0, Y1 - 1e-6)
    XG, YG = np.meshgrid(fx_, fy_, indexing='ij')
    rr = E.eos(XG.ravel(), YG.ravel())
    maps = {'x': fx_, 'y': fy_, 'Gam': rr['Gam'].reshape(XG.shape), 'eta': rr['eta'].reshape(XG.shape),
            'radfrac': (rr['Pr_n'] / rr['fx']).reshape(XG.shape), 'P_Pa': (rr['P'] * E.EVCM3_PA).reshape(XG.shape)}
    for k in METHODS:
        o = M[k].eval(XG.ravel(), YG.ravel(), True)
        maps[f'errP_{k}'] = np.abs(o['P'] / rr['P'] - 1).reshape(XG.shape)
        maps[f'errE_{k}'] = np.abs(o['e'] / rr['e'] - 1).reshape(XG.shape)
        nn = np.exp(XG.ravel())
        rM = np.abs(o['ex'] - (o['P'] - o['Py']) / nn) / (o['P'] / nn)
        maps[f'maxw_{k}'] = rM.reshape(XG.shape)
    np.savez('maps10.npz', **maps)

    # cumulative entropy along one loop (ppd=10, sub) for the figure
    xa, xb, ya, yb = 0.9, 7.9, 0.5, 5.2
    xa += T.X0; xb += T.X0; ya += T.Y0; yb += T.Y0
    cum = {}
    for k in ['LB', 'LS', 'RQ']:
        ed = edge_integrals(M[k], g, xa, xb, ya, yb)
        cum[k] = np.concatenate([[0.0], np.cumsum(ed)]).tolist()
    # finer cumulative path for plotting
    def path_cum(m, N=400):
        tot = 0.0; s = [0.0]
        edges = [('h', ya, xa, xb, 1), ('v', xb, ya, yb, 1), ('h', yb, xb, xa, 1), ('v', xa, yb, ya, 1)]
        for kind, c, a, b, _ in edges:
            seg = np.linspace(a, b, N + 1)
            for lo, hi in zip(seg[:-1], seg[1:]):
                px, w = gl_pieces(min(lo, hi), max(lo, hi), g.xs if kind == 'h' else g.ys, ng=4)
                sgn = 1.0 if hi >= lo else -1.0
                if kind == 'h':
                    o = m.eval(px, np.full_like(px, c), True)
                    val = np.sum(w * (o['ex'] - o['P'] / np.exp(px)) / np.exp(c))
                else:
                    o = m.eval(np.full_like(px, c), px, True)
                    val = np.sum(w * o['ey'] / np.exp(px))
                tot += sgn * val; s.append(tot)
        return np.array(s)
    res['loop_path'] = {k: path_cum(M[k]).tolist() for k in ['LB', 'LS', 'RC', 'RQ']}
    json.dump(res, open('results_exp1.json', 'w'), indent=1)
    print('saved', flush=True)


if __name__ == '__main__':
    main()
