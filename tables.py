import numpy as np, os
import eos as E
from interp import *

X0 = E.rho_to_x(0.1); Y0 = np.log(10.0)
PPD_FINE = 40
def make_grid(ppd):
    return Grid(X0, Y0, np.log(10.0)/ppd, np.log(10.0)/ppd, 4*ppd+1, 3*ppd+1)

_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nodal40_phi.npz')
def fine_nodal():
    g = make_grid(PPD_FINE)
    if os.path.exists(_cache):
        z = np.load(_cache); return {tuple(int(c) for c in k.split('_')): z[k] for k in z.files}
    X, Y = np.meshgrid(g.xs, g.ys, indexing='ij')
    D = E.phi_nodal(X, Y, level=2)
    np.savez(_cache, **{f'{p}_{q}': v for (p, q), v in D.items()})
    return D

def build(ppd, rad='full'):
    """rad='full': tables contain radiation (stress test).  rad='sub': matter-only tables, analytic
    radiation added back after interpolation (standard practice)."""
    g = make_grid(ppd); k = PPD_FINE // ppd
    D = fine_nodal()
    Ds = {key: v[::k, ::k].copy() for key, v in D.items()}
    if rad == 'sub':
        X, Y = np.meshgrid(g.xs, g.ys, indexing='ij')
        rr = (E.A_RAD / 3.0) * np.exp(3 * Y - X)          # P_r/(n T)
        for (p, q) in Ds:
            Ds[(p, q)] = Ds[(p, q)] + ((-1) ** p) * (3 ** q) * rr
    n = np.exp(g.xs)[:, None]; Tn = np.exp(g.ys)[None, :]
    P = n * Tn * Ds[(1, 0)]; e = -Tn * Ds[(0, 1)]
    D1 = {key: Ds[key] for key in [(0,0),(1,0),(0,1),(1,1)]}
    M = {}
    M['LB'] = LogBilinear(g, P, e); M['LB'].name = 'LB'
    M['LS'] = LogSpline(g, P, e); M['LS'].name = 'LS'
    M['HC'] = HermiteF(g, D1, 1, 'HC')
    M['HQ'] = HermiteF(g, Ds, 2, 'HQ')
    M['RC'] = HermiteF(g, reconstruct_from_PE(g, P, e, level=1), 1, 'RC')
    M['RQ'] = HermiteF(g, reconstruct_from_PE(g, P, e, level=2), 2, 'RQ')
    if rad == 'sub':
        M = {k_: AddRad(v, E.A_RAD) for k_, v in M.items()}
    return g, M, P, e
