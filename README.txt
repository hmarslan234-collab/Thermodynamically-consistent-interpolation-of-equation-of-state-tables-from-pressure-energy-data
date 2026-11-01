Reproduction guide (Python 3 with NumPy, SciPy, SymPy, Matplotlib; Node.js with the 'docx' package for the manuscript)

Order of execution (all scripts run from this directory):
  1. python3 exp1_accuracy.py      accuracy, Maxwell residual, entropy closure, stability, timing  -> results_exp1.json, maps10.npz
  2. python3 exp2_hugoniot.py      Hugoniot test                                                    -> results_exp2.json
  3. python3 exp3_hydro.py ref     reference shock tube with the exact EOS                          -> hydro_ref.npz
     python3 exp3_hydro.py sub5 | sub10 | full5 | full10     shock tube with each table variant     -> results_exp3_*.json, profiles_*.npz
  4. python3 make_figures.py       figures                                                          -> figs/
  5. node build_docx.js            manuscript (writes to /mnt/user-data/outputs; edit the path as needed)

Files
  eos.py          model EOS (ions + Fermi-Dirac electrons + OCP correlation + radiation), analytic derivatives
  interp.py       schemes LB, LS, HC, HQ, RC, RQ and the reconstruction from P and e tables
  tables.py       table construction ('full' = radiation in table, 'sub' = matter-only + analytic radiation)
  test_*.py       sanity checks used during development

Notes
  - The first import of eos.py builds fd_cache.pkl (Fermi-Dirac integral splines, about a minute); tables.py builds nodal40_phi.npz on first use.
  - Each exp3 case takes about one minute; run them separately if your environment limits command time.
