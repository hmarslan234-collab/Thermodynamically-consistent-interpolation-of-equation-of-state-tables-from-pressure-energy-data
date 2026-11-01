import numpy as np, json
import eos as E, tables as T
from exp1_accuracy import REF, METHODS, X1, Y1

def hugoniot(m, Ts, x0, y0, xmax, nit=60):
    o0 = m.eval(np.array([x0]), np.array([y0])); P0, e0 = o0['P'][0], o0['e'][0]
    v0 = np.exp(-x0)
    y = np.log(Ts)
    H = lambda x: (lambda o: o['e'] - e0 - 0.5 * (o['P'] + P0) * (v0 - np.exp(-x)))(m.eval(x, y))
    lo = np.full_like(y, x0); hi = np.full_like(y, xmax)
    valid = (H(lo) > 0) & (H(hi) < 0)
    for _ in range(nit):
        mid = 0.5 * (lo + hi)
        pos = H(mid) > 0
        lo = np.where(pos, mid, lo); hi = np.where(pos, hi, mid)
    x = 0.5 * (lo + hi)
    o = m.eval(x, y)
    return x, o['P'], valid

x0 = E.rho_to_x(1.0); y0 = np.log(10.0)
Ts = np.logspace(np.log10(14.0), np.log10(9000.0), 120)
xr, Pr_, vr = hugoniot(REF, Ts, x0, y0, X1)
print('ref valid', vr.sum(), 'of', len(Ts), ' max compression', np.exp(xr[vr].max() - x0))
res = {'T': Ts.tolist(), 'ref_rho': E.x_to_rho(xr).tolist(), 'ref_P_Pa': (Pr_ * E.EVCM3_PA).tolist(),
       'ref_valid': vr.tolist(), 'err': {}, 'curves': {}}
for rad in ('sub', 'full'):
    for ppd in (5, 10, 20):
        g, M, P, e = T.build(ppd, rad)
        for k in METHODS:
            x, Ph, v = hugoniot(M[k], Ts, x0, y0, X1)
            ok = vr & v
            erho = np.abs(np.exp(x - xr) - 1)[ok]; eP = np.abs(Ph / Pr_ - 1)[ok]
            res['err'][f'{rad}|{ppd}|{k}'] = dict(rho_med=float(np.median(erho)), rho_max=float(erho.max()),
                                                    P_med=float(np.median(eP)), P_max=float(eP.max()), nvalid=int(ok.sum()))
            if ppd == 10:
                res['curves'][f'{rad}|{k}'] = dict(erho=np.where(ok, np.abs(np.exp(x - xr) - 1), np.nan).tolist(),
                                                   eP=np.where(ok, np.abs(Ph / Pr_ - 1), np.nan).tolist())
json.dump(res, open('results_exp2.json', 'w'))
for rad in ('sub', 'full'):
    for ppd in (5, 10, 20):
        print(rad, ppd, ' '.join(f"{k}: rho {res['err'][f'{rad}|{ppd}|{k}']['rho_med']:.1e}/{res['err'][f'{rad}|{ppd}|{k}']['rho_max']:.1e} P {res['err'][f'{rad}|{ppd}|{k}']['P_med']:.1e}/{res['err'][f'{rad}|{ppd}|{k}']['P_max']:.1e}" for k in METHODS))
