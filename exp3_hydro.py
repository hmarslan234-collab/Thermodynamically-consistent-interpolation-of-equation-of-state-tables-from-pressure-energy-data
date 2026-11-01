import numpy as np, json, time, sys
import eos as E, tables as T
from exp1_accuracy import REF, METHODS, X1, Y1

L_CM = 0.2; NCELL = 300
RHO0 = 1.0                 # g/cm^3 everywhere
T_L, T_R = 1000.0, 10.0    # eV  (hot slab on the left, cold plasma on the right)
CQ, CL = 1.5, 0.3          # artificial viscosity coefficients
NBIS = 42
clamp_count = [0]


def make_eos(m):
    """Return eos(rho, e_cgs) -> (P_cgs, T_eV) using bisection on ln T of the model's e(n,T)."""
    def f(rho, ecgs):
        x = np.log(rho / E.MP_G)
        etarget = ecgs * E.MP_G / E.EV_ERG
        lo = np.full_like(x, T.Y0); hi = np.full_like(x, Y1)
        for _ in range(NBIS):
            mid = 0.5 * (lo + hi)
            em = m.eval(x, mid)['e']
            up = em < etarget
            lo = np.where(up, mid, lo); hi = np.where(up, hi, mid)
        y = 0.5 * (lo + hi)
        if np.any(y > Y1 - 1e-6):
            clamp_count[0] += 1
        o = m.eval(x, y)
        return o['P'] * E.EV_ERG, np.exp(y)
    return f


def run(m, dt, nsteps, record=False):
    eosf = make_eos(m)
    N = NCELL
    X = np.linspace(0, L_CM, N + 1)
    dx = L_CM / N
    M = np.full(N, RHO0 * dx)
    xc = 0.5 * (X[1:] + X[:-1])
    n0 = RHO0 / E.MP_G
    Tinit = np.where(xc < 0.5 * L_CM, T_L, T_R)
    o = m.eval(np.full(N, np.log(n0)), np.log(Tinit))
    e = o['e'] * E.EV_ERG / E.MP_G
    rho = M / (X[1:] - X[:-1])
    P, Tt = eosf(rho, e)
    q = np.zeros(N)
    mj = np.zeros(N + 1); mj[1:-1] = 0.5 * (M[1:] + M[:-1])
    Pi = P + q
    U = np.zeros(N + 1)
    acc = np.zeros(N + 1); acc[1:-1] = -(Pi[1:] - Pi[:-1]) / mj[1:-1]
    U = U + 0.5 * dt * acc                      # U^{1/2}
    cflmax = 0.0
    for step in range(nsteps):
        v_old = (X[1:] - X[:-1]) / M
        X = X + dt * U
        v_new = (X[1:] - X[:-1]) / M
        rho = 1.0 / v_new
        dv = v_new - v_old
        du = U[1:] - U[:-1]
        cs2 = (5.0 / 3.0) * P / rho
        qn = np.where(du < 0, rho * (CQ ** 2 * du ** 2 + CL * np.sqrt(cs2) * np.abs(du)), 0.0)
        Pi_old = P + q
        e_star = e - Pi_old * dv
        P_star, _ = eosf(rho, e_star)
        e = e - 0.5 * (Pi_old + P_star + qn) * dv
        P, Tt = eosf(rho, e)
        q = qn
        Pi = P + q
        acc[1:-1] = -(Pi[1:] - Pi[:-1]) / mj[1:-1]
        U = U + dt * acc
        cflmax = max(cflmax, float(np.max((np.sqrt(cs2) + np.abs(U[1:])) * dt / (X[1:] - X[:-1]))))
    return dict(xc=0.5 * (X[1:] + X[:-1]), rho=rho, P=P, T=Tt, e=e, U=0.5 * (U[1:] + U[:-1]), cfl=cflmax)


def l1(a, b):
    return float(np.sum(np.abs(a - b)) / np.sum(np.abs(b)))


def setup():
    P_L = REF.eval(np.array([np.log(RHO0 / E.MP_G)]), np.array([np.log(T_L)]))['P'][0] * E.EV_ERG
    cmax = np.sqrt(5.0 / 3.0 * P_L / RHO0) * 1.6
    dx = L_CM / NCELL
    dt = 0.25 * dx / cmax
    t_end = 1.0e-9
    nsteps = int(round(t_end / dt)); dt = t_end / nsteps
    return dt, nsteps, t_end


if __name__ == '__main__':
    case = sys.argv[1]
    dt, nsteps, t_end = setup()
    if case == 'ref':
        t0 = time.time()
        ref = run(REF, dt, nsteps)
        print('ref %.1f s cfl %.3f' % (time.time() - t0, ref['cfl']), flush=True)
        np.savez('hydro_ref.npz', **{k: v for k, v in ref.items()}, dt=dt, nsteps=nsteps, t_end=t_end)
    else:
        z = np.load('hydro_ref.npz'); ref = {k: z[k] for k in ['xc', 'rho', 'P', 'T', 'e', 'U', 'cfl']}
        rad, ppd = case[:-len(case.lstrip('subfull'))].strip(), int(case.lstrip('subfull'))
        g, Ms, P_, e_ = T.build(ppd, rad)
        out = {}; prof = {}
        for k in METHODS:
            clamp_count[0] = 0
            t0 = time.time()
            r = run(Ms[k], dt, nsteps)
            out[k] = dict(rho_L1=l1(r['rho'], ref['rho']), P_L1=l1(r['P'], ref['P']), T_L1=l1(r['T'], ref['T']),
                          rho_max=float(np.max(np.abs(r['rho'] / ref['rho'] - 1))), T_max=float(np.max(np.abs(r['T'] / ref['T'] - 1))),
                          P_max=float(np.max(np.abs(r['P'] / ref['P'] - 1))), cfl=r['cfl'], clamps=clamp_count[0])
            for q_ in ('rho', 'P', 'T'):
                prof[f'{k}|{q_}'] = r[q_]
            print(case, k, '%.0fs' % (time.time() - t0), {a: float('%.2e' % b) for a, b in out[k].items()}, flush=True)
        json.dump(out, open(f'results_exp3_{case}.json', 'w'), indent=1)
        np.savez(f'profiles_{case}.npz', **prof)
