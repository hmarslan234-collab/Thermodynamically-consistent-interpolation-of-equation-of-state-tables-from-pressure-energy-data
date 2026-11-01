import numpy as np, json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter
import eos as E

os.makedirs('figs', exist_ok=True)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.labelsize': 9, 'axes.titlesize': 9,
                     'legend.fontsize': 8, 'xtick.labelsize': 8, 'ytick.labelsize': 8, 'axes.linewidth': 0.8,
                     'figure.dpi': 100, 'savefig.dpi': 220})
M = ['LB', 'LS', 'HC', 'HQ', 'RC', 'RQ']
LABEL = {'LB': 'LB  log-bilinear (P, e)', 'LS': 'LS  bicubic spline (P, e)', 'HC': 'HC  bicubic Hermite, derivative data',
         'HQ': 'HQ  biquintic Hermite, derivative data', 'RC': 'RC  bicubic Hermite from P-e (this work)',
         'RQ': 'RQ  biquintic Hermite from P-e (this work)'}
COL = {'LB': '#7f7f7f', 'LS': '#1f77b4', 'HC': '#ff7f0e', 'HQ': '#2ca02c', 'RC': '#d62728', 'RQ': '#9467bd'}
MK = {'LB': 'o', 'LS': 's', 'HC': '^', 'HQ': 'v', 'RC': 'D', 'RQ': 'P'}
LS_ = {'LB': '-', 'LS': '-', 'HC': '--', 'HQ': '--', 'RC': '-', 'RQ': '-'}
r1 = json.load(open('results_exp1.json'))
r2 = json.load(open('results_exp2.json'))
mp = np.load('maps10.npz')
PPDS = [5, 10, 20, 40]
FLOOR = 1e-16

# ---------------------------------------------------------------- Fig 1 regime map
rho = E.x_to_rho(mp['x']); T = np.exp(mp['y'])
lr, lT = np.log10(rho), np.log10(T)
fig, ax = plt.subplots(figsize=(6.2, 5.0))
Pl = np.log10(mp['P_Pa'])
cs = ax.contourf(lr, lT, Pl.T, levels=np.arange(11, 19.1, 1.0), cmap='Blues', alpha=0.85)
cb = fig.colorbar(cs, ax=ax, pad=0.02); cb.set_label(r'$\log_{10}\,P$ [Pa]')
c1 = ax.contour(lr, lT, mp['Gam'].T, levels=[1.0], colors='#d62728', linewidths=1.6)
c2 = ax.contour(lr, lT, mp['eta'].T, levels=[0.0], colors='#2ca02c', linewidths=1.6)
c3 = ax.contour(lr, lT, mp['radfrac'].T, levels=[0.5], colors='#ff7f0e', linewidths=1.6)
ax.plot(np.log10(r2['ref_rho']), np.log10(r2['T']), 'k-', lw=1.8)
ax.plot([0], [1], 'k*', ms=10, clip_on=False, zorder=5)
ax.plot([0, 0], [np.log10(10.0), np.log10(1000.0)], 'ko', ms=5, mfc='w', clip_on=False, zorder=5)
ax.set_xlabel(r'$\log_{10}\,\rho$  [g cm$^{-3}$]'); ax.set_ylabel(r'$\log_{10}\,T$  [eV]')
from matplotlib.lines import Line2D
ax.legend(handles=[Line2D([], [], color='#d62728', lw=1.6, label=r'$\Gamma_{ii}=1$ (strongly coupled below)'),
                   Line2D([], [], color='#2ca02c', lw=1.6, label=r'$\mu_e=0$ (degenerate below/right)'),
                   Line2D([], [], color='#ff7f0e', lw=1.6, label=r'$P_r/P=0.5$ (radiation above)'),
                   Line2D([], [], color='k', lw=1.8, label='principal Hugoniot'),
                   Line2D([], [], color='k', marker='*', ls='', ms=8, label='Hugoniot initial state'),
                   Line2D([], [], color='k', marker='o', mfc='w', ls='', ms=5, label='shock-tube initial states')],
          loc='upper center', bbox_to_anchor=(0.45, -0.14), ncol=2, framealpha=0.95, fontsize=7)
ax.set_xlim(lr.min(), lr.max()); ax.set_ylim(lT.min(), lT.max())
fig.tight_layout(); fig.savefig('figs/fig1_domain.png', bbox_inches='tight'); plt.close(fig)

# ---------------------------------------------------------------- Fig 2 convergence
fig, axs = plt.subplots(1, 2, figsize=(6.6, 3.5), sharey=False)
h = np.log(10) / np.array(PPDS)
for ax, stat, ttl in zip(axs, ['med', 'max'], ['median relative error in $P$', 'maximum relative error in $P$']):
    for k in M:
        y = [max(r1['acc'][f'sub|{p}|{k}']['P'][stat], FLOOR) for p in PPDS]
        ax.loglog(PPDS, y, ls=LS_[k], marker=MK[k], color=COL[k], ms=4.5, lw=1.2, label=k)
    xs_ = np.array([5, 40.0])
    for ordr, yy in [(2, 3e-3), (4, 3e-4), (6, 1e-5)]:
        ax.loglog(xs_, yy * (xs_ / 5.0) ** (-ordr), color='0.6', lw=0.7, ls=':')
        ax.text(41, yy * (8.0) ** (-ordr), f'h$^{ordr}$', fontsize=7, color='0.4', va='center')
    ax.axhline(1e-12, color='0.8', lw=0.8)
    ax.set_xlabel('table resolution [points per decade]'); ax.set_title(ttl)
    ax.set_xticks(PPDS); ax.set_xticklabels([str(p) for p in PPDS]); ax.set_xlim(4.3, 55)
    ax.set_ylim(5e-13, 5e-2 if stat == 'med' else 5e-1)
axs[0].set_ylabel('relative error'); axs[0].legend(ncol=2, loc='lower left', fontsize=7)
fig.tight_layout(); fig.savefig('figs/fig2_convergence.png'); plt.close(fig)

# ---------------------------------------------------------------- Fig 3 consistency
fig, axs = plt.subplots(1, 3, figsize=(7.4, 3.0))
ax = axs[0]
for k in M:
    y = [max(r1['cons'][f'sub|{p}|{k}']['maxwell']['med'], 1e-17) for p in PPDS]
    ax.loglog(PPDS, y, ls=LS_[k], marker=MK[k], color=COL[k], ms=4, lw=1.2, label=k)
ax.set_title('Maxwell-relation residual (median)', fontsize=8); ax.set_xlabel('points per decade'); ax.set_ylabel('relative residual')
ax.set_xticks(PPDS); ax.set_xticklabels([str(p) for p in PPDS]); ax.set_ylim(3e-18, 1e-1); ax.xaxis.set_minor_formatter(NullFormatter()); ax.set_xlim(4.3, 46)
ax.legend(fontsize=6, ncol=2, loc='center right')
ax = axs[1]
for k in M:
    y = [max(r1['cons'][f'sub|{p}|{k}']['closure']['med'], 1e-17) for p in PPDS]
    ax.loglog(PPDS, y, ls=LS_[k], marker=MK[k], color=COL[k], ms=4, lw=1.2)
ax.axhline(r1['closure_ref']['med'], color='k', lw=0.8, ls=':'); ax.text(5.2, r1['closure_ref']['med'] * 2.5, 'quadrature floor', fontsize=6.5)
ax.set_title('entropy-loop closure (median)', fontsize=8); ax.set_xlabel('points per decade')
ax.set_xticks(PPDS); ax.set_xticklabels([str(p) for p in PPDS]); ax.set_ylim(3e-18, 1e-1); ax.xaxis.set_minor_formatter(NullFormatter()); ax.set_xlim(4.3, 46)
ax = axs[2]
lp = {k: np.array(v) for k, v in r1['loop_path'].items()}
fr = np.linspace(0, 1, len(lp['RQ']))
win = 13   # about one table cell of the sampled path (400 samples per edge, ~30 cells per edge)
sm = lambda a: np.convolve(np.pad(a, (win // 2, win // 2), mode='edge'), np.ones(win) / win, mode='valid')
for k in ['LB', 'LS', 'RC']:
    ax.plot(fr, sm(lp[k] - lp['RQ']), color=COL[k], lw=1.4, label=k)
ax.axhline(0, color='k', lw=0.6)
ax.set_title('entropy mismatch around one loop', fontsize=8); ax.set_xlabel('fraction of loop traversed'); ax.set_ylabel(r'$\Delta s / k_B$ (relative to RQ)')
ax.legend(fontsize=7)
fig.tight_layout(); fig.savefig('figs/fig3_consistency.png'); plt.close(fig)

# ---------------------------------------------------------------- Fig 4 error maps
fig, axs = plt.subplots(2, 2, figsize=(6.6, 5.0), sharex=True, sharey=True)
for ax, k in zip(axs.ravel(), ['LB', 'LS', 'RC', 'RQ']):
    Z = np.log10(np.maximum(mp[f'errP_{k}'], 1e-14))
    pc = ax.pcolormesh(lr, lT, Z.T, cmap='magma_r', vmin=-11, vmax=-2, shading='auto')
    ax.contour(lr, lT, mp['Gam'].T, levels=[1.0], colors='w', linewidths=0.8, linestyles='--')
    ax.set_title(LABEL[k], fontsize=7.5)
fig.subplots_adjust(right=0.86, hspace=0.25, wspace=0.08)
cax = fig.add_axes([0.89, 0.12, 0.025, 0.76])
cb = fig.colorbar(pc, cax=cax); cb.set_label(r'$\log_{10}$ |relative error in $P$|')
for ax in axs[1]: ax.set_xlabel(r'$\log_{10}\,\rho$ [g cm$^{-3}$]')
for ax in axs[:, 0]: ax.set_ylabel(r'$\log_{10}\,T$ [eV]')
fig.savefig('figs/fig4_errormaps.png', bbox_inches='tight'); plt.close(fig)

# ---------------------------------------------------------------- Fig 5 Hugoniot
fig, axs = plt.subplots(1, 2, figsize=(6.8, 3.3))
Th = np.array(r2['T']); rh = np.array(r2['ref_rho']); Ph = np.array(r2['ref_P_Pa'])
ax = axs[0]
ax.loglog(rh, Ph, 'k-', lw=1.6)
ax.set_xlabel(r'$\rho_H$ [g cm$^{-3}$]'); ax.set_ylabel(r'$P_H$ [Pa]'); ax.set_title('model Hugoniot (initial state 1 g cm$^{-3}$, 10 eV)', fontsize=8)
ax2 = ax.twinx(); ax2.semilogy(rh, Th, color='#d62728', lw=1.2, ls='--'); ax2.set_ylabel(r'$T_H$ [eV]', color='#d62728')
ax = axs[1]
for k in M:
    y = np.array(r2['curves'][f'sub|{k}']['erho'], float)
    ax.loglog(Th, np.maximum(y, 1e-13), ls=LS_[k], color=COL[k], lw=1.2, label=k)
ax.set_xlabel(r'$T_H$ [eV]'); ax.set_ylabel(r'relative error in $\rho_H$'); ax.set_title('10 points per decade, matter-only tables', fontsize=8)
ax.legend(ncol=3, fontsize=7, loc='lower right'); ax.set_ylim(1e-13, 1e-1)
fig.tight_layout(); fig.savefig('figs/fig5_hugoniot.png'); plt.close(fig)

# ---------------------------------------------------------------- Fig 6 shock tube
ref = np.load('hydro_ref.npz'); pr = np.load('profiles_sub5.npz')
x = ref['xc'] * 10.0   # mm
fig, axs = plt.subplots(1, 2, figsize=(6.8, 3.2))
ax = axs[0]
ax.plot(x, ref['rho'], color='#1f77b4', lw=1.5); ax.set_ylabel(r'$\rho$ [g cm$^{-3}$]', color='#1f77b4'); ax.set_xlabel('position [mm]')
axb = ax.twinx(); axb.plot(x, ref['T'], color='#d62728', lw=1.5, ls='--'); axb.set_ylabel(r'$T$ [eV]', color='#d62728')
ax.set_title('reference solution at 1 ns', fontsize=8)
ax = axs[1]
for k in M:
    err = np.abs(pr[f'{k}|rho'] / ref['rho'] - 1)
    ax.semilogy(x, np.maximum(err, 1e-13), color=COL[k], ls=LS_[k], lw=1.1, label=k)
ax.set_xlabel('position [mm]'); ax.set_ylabel(r'relative density error'); ax.set_title('5 points per decade, matter-only tables', fontsize=8)
ax.legend(ncol=3, fontsize=7, loc='lower left'); ax.set_ylim(1e-11, 1e-1)
fig.tight_layout(); fig.savefig('figs/fig6_shocktube.png'); plt.close(fig)
print('figures done', os.listdir('figs'))
