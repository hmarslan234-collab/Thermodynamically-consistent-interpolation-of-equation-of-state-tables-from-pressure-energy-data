const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Footer, Header,
  AlignmentType, Tab, WidthType, BorderStyle, ShadingType, PageNumber, TabStopType, HeadingLevel, LevelFormat, VerticalAlign,
} = require('docx');

const R1 = JSON.parse(fs.readFileSync('results_exp1.json'));
const R2 = JSON.parse(fs.readFileSync('results_exp2.json'));
const R3 = {};
for (const c of ['sub5', 'sub10', 'full5', 'full10']) R3[c] = JSON.parse(fs.readFileSync(`results_exp3_${c}.json`));
const METHODS = ['LB', 'LS', 'HC', 'HQ', 'RC', 'RQ'];

// ------------------------------------------------------------------ helpers
const FONT = 'Times New Roman';
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
function sci(v, d = 1) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 0.1 && a < 100) return String(Number(v.toPrecision(d + 1)));
  const [m, e] = v.toExponential(d).split('e');
  const ex = String(parseInt(e, 10)).split('').map(c => SUP[c]).join('');
  return `${m}×10${ex}`;
}
function rich(text, base = {}) {
  const parts = text.split(/(<i>.*?<\/i>|<b>.*?<\/b>|\^\{.*?\}|_\{.*?\})/g).filter(s => s !== '');
  return parts.map(p => {
    if (p.startsWith('<i>')) return new TextRun({ text: p.slice(3, -4), italics: true, font: FONT, ...base });
    if (p.startsWith('<b>')) return new TextRun({ text: p.slice(3, -4), bold: true, font: FONT, ...base });
    if (p.startsWith('^{') || p.startsWith('_{')) {
      const inner = p.slice(2, -1); const it = inner.includes('<i>'); const txt = inner.replace(/<\/?i>/g, '');
      return new TextRun({ text: txt, italics: it, superScript: p.startsWith('^{'), subScript: p.startsWith('_{'), font: FONT, ...base });
    }
    return new TextRun({ text: p, font: FONT, ...base });
  });
}
const body = (t, o = {}) => new Paragraph({ children: rich(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 276 }, ...o });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
function eq(text, n) {
  return new Paragraph({
    children: [new TextRun({ children: [new Tab()], font: FONT }), ...rich(text), new TextRun({ children: [new Tab()], font: FONT }), new TextRun({ text: `(${n})`, font: FONT })],
    tabStops: [{ type: TabStopType.CENTER, position: 4536 }, { type: TabStopType.RIGHT, position: 9072 }],
    spacing: { before: 60, after: 120 },
  });
}
function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }
function figure(file, caption, widthPx = 590) {
  const data = fs.readFileSync(file);
  const [w, h] = pngSize(data);
  const hh = Math.round(widthPx * h / w);
  return [
    new Paragraph({ children: [new ImageRun({ type: 'png', data, transformation: { width: widthPx, height: hh }, altText: { title: caption.slice(0, 40), description: caption, name: file } })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true }),
    new Paragraph({ children: rich(caption, { size: 19 }), alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 } }),
  ];
}
const thin = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: thin, bottom: thin, left: thin, right: thin };
function cell(text, w, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: o.head ? { fill: 'E7E6E6', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
    children: [new Paragraph({ alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER, children: rich(String(text), { size: o.size || 17, bold: !!o.head }) })],
  });
}
function table(caption, headers, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const trs = [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { head: true, left: i === 0 && !o.centerFirst, size: o.size })) })];
  rows.forEach(r => trs.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], { left: i === 0 || (o.leftCols || []).includes(i), size: o.size })) })));
  return [
    new Paragraph({ children: rich(caption, { size: 19 }), spacing: { before: 160, after: 80 }, keepNext: true, alignment: AlignmentType.JUSTIFIED }),
    new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: trs }),
    new Paragraph({ children: [], spacing: { after: 160 } }),
  ];
}
const num = (t) => t;

// ------------------------------------------------------------------ table builders from results
const A = (rad, ppd, k) => R1.acc[`${rad}|${ppd}|${k}`];
const C = (rad, ppd, k) => R1.cons[`${rad}|${ppd}|${k}`];
const H = (rad, ppd, k) => R2.err[`${rad}|${ppd}|${k}`];

const tab3 = METHODS.map(k => { const a = A('sub', 10, k); return [k, sci(a.P.med), sci(a.P.p99), sci(a.P.max), sci(a.e.med), sci(a.e.max), sci(a.cs2.med), sci(a.cs2.max)]; });
const tab4 = METHODS.map(k => { const c = C('sub', 10, k); return [k, sci(c.maxwell.med), sci(c.maxwell.max), sci(c.closure.med), sci(c.closure.max), String(c.viol)]; });
const tab5 = METHODS.map(k => { const a5 = A('full', 5, k), a10 = A('full', 10, k), c5 = C('full', 5, k), c10 = C('full', 10, k);
  return [k, sci(a5.P.med), sci(a5.P.max), sci(a5.e.max), String(c5.viol), sci(a10.P.med), sci(a10.P.max), sci(a10.e.max), String(c10.viol)]; });
const tab6 = METHODS.map(k => [k, sci(H('sub', 5, k).rho_max), sci(H('sub', 10, k).rho_max), sci(H('sub', 5, k).P_max), sci(H('sub', 10, k).P_max),
  sci(R3.sub5[k].rho_L1), sci(R3.sub10[k].rho_L1), sci(R3.sub5[k].T_max), sci(R3.sub10[k].T_max)]);
const tab6b = METHODS.map(k => [k, sci(H('full', 10, k).rho_max), sci(H('full', 10, k).P_max), sci(R3.full10[k].rho_L1), sci(R3.full10[k].T_max)]);
const ord = (rad, k, q, s, a, b) => Math.log(A(rad, a, k)[q][s] / A(rad, b, k)[q][s]) / Math.log(b / a);
const ordM = (k) => Math.log(C('sub', 5, k).maxwell.med / C('sub', 20, k).maxwell.med) / Math.log(4);
const tab8 = METHODS.map(k => [k, ord('sub', k, 'P', 'med', 5, 20).toFixed(1), ord('sub', k, 'P', 'max', 5, 20).toFixed(1), ord('sub', k, 'e', 'med', 5, 20).toFixed(1),
  (k === 'LB' || k === 'LS') ? ordM(k).toFixed(1) : '–']);
const T = R1.time;
const rel = k => (T[k] / T.LB).toFixed(1);
const tab7 = [
  ['LB', '2', '2', `${T.LB.toFixed(3)} (1.0)`], ['LS', '2', '2', `${T.LS.toFixed(3)} (${rel('LS')})`], ['HC', '4', '4', `${T.HC.toFixed(3)} (${rel('HC')})`],
  ['HQ', '9', '9', `${T.HQ.toFixed(3)} (${rel('HQ')})`], ['RC', '2', '4', `${T.RC.toFixed(3)} (${rel('RC')})`], ['RQ', '2', '9', `${T.RQ.toFixed(3)} (${rel('RQ')})`],
  ['Model EOS (direct)', '–', '–', `${T.REF_per_1e6.toFixed(2)} (${(T.REF_per_1e6 / T.LB).toFixed(1)})`]];

// ------------------------------------------------------------------ content
const c = [];
const D = R1.domain;
c.push(new Paragraph({ children: [new TextRun({ text: 'Thermodynamically consistent interpolation of equation-of-state tables from pressure–energy data: accuracy, consistency and hydrodynamic impact in warm and hot dense plasmas', bold: true, size: 32, font: FONT })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
c.push(new Paragraph({ children: rich('[Author names]', { size: 24 }), alignment: AlignmentType.CENTER, spacing: { after: 40 } }));
c.push(new Paragraph({ children: rich('<i>[Affiliation, city, country]</i>', { size: 21 }), alignment: AlignmentType.CENTER, spacing: { after: 40 } }));
c.push(new Paragraph({ children: rich('<i>Corresponding author: [name, e-mail]</i>', { size: 21 }), alignment: AlignmentType.CENTER, spacing: { after: 240 } }));

c.push(new Paragraph({ children: [new TextRun({ text: 'Abstract', bold: true, size: 24, font: FONT })], spacing: { before: 120, after: 80 } }));
c.push(body('Radiation-hydrodynamics codes for inertial fusion and laboratory astrophysics usually obtain pressure and energy from tables rather than from the underlying physics model. Interpolating the two quantities independently is simple and can be very accurate, but it breaks the Maxwell relation that links them, so the interpolated surface does not correspond to any thermodynamic potential. Interpolating a free energy restores consistency, but it requires derivative data that legacy tables rarely contain. We describe a reconstruction that builds a dimensionless free energy, together with the nodal derivatives needed for bicubic or biquintic Hermite interpolation, from tabulated pressure and energy values alone. We benchmark it against four other schemes on a model fully ionized hydrogen plasma spanning 0.1–1000 g cm^{-3} and 10 eV–10 keV (every state above 1.8×10^{11} Pa), where Coulomb coupling, electron degeneracy and radiation pressure all matter. With matter-only tables at ten points per decade, the biquintic reconstruction has a median pressure error of 3×10^{-10}, compared with 1.3×10^{-7} for an independent bicubic spline and 1.1×10^{-4} for log-bilinear interpolation, and it satisfies the Maxwell relation to round-off, whereas the spline residual is 2×10^{-6} (median). In a Hugoniot calculation and a one-dimensional shock tube, the biquintic scheme reduces equation-of-state errors by three to five orders of magnitude relative to log-bilinear lookup and by a factor of 15–400 relative to the spline. When radiation is left inside coarse tables, however, the reconstruction can produce thermodynamically unstable cells, and we therefore recommend subtracting the radiation term before tabulation. We discuss the limits of a smooth analytic test model and of applying high-order differences to noisy tables.'));
c.push(new Paragraph({ children: rich('<b>Keywords:</b> equation of state; table interpolation; thermodynamic consistency; Hermite interpolation; warm dense matter; radiation hydrodynamics', { size: 21 }), spacing: { after: 200 } }));

// ---- 1 Introduction
c.push(H1('1. Introduction'));
c.push(body('Simulations of inertial confinement fusion implosions, shock-compressed laboratory targets and stellar or planetary interiors all need the pressure and internal energy of matter over many decades in density and temperature. Evaluating the underlying physics model at every cell and every time step is rarely affordable, so codes read the equation of state (EOS) from tables and interpolate between the tabulated points. Libraries such as SESAME [1] provide pressure and energy on logical density–temperature grids, and first-principles tables for the fusion fuels, such as FPEOS for deuterium, cover densities from about 2×10^{-3} to 1.6×10^{3} g cm^{-3} and temperatures from 1.35 eV to 5.5 keV [7]; an improved deuterium table has since been published [8]. The numerical quality of the interpolation therefore enters every simulation that uses such a table.'));
c.push(body('The most common practice is to interpolate pressure and energy independently, often in logarithmic variables. This is easy to implement and, with a smooth interpolant, can be accurate. Its weakness is that the two interpolants are unrelated away from the grid points. Pressure and energy of an equilibrium system derive from one thermodynamic potential, and therefore satisfy the Maxwell relation between (∂<i>e</i>/∂<i>ρ</i>)_{<i>T</i>} and (∂<i>P</i>/∂<i>T</i>)_{<i>ρ</i>}. Independent interpolants do not, and the violation shows up as spurious entropy production or loss in numerical solutions and as errors in derived quantities such as the adiabatic sound speed [2,3,4].'));
c.push(body('Swesty [2] proposed to interpolate the Helmholtz free energy with Hermite polynomials and to obtain pressure, entropy and energy by differentiation, which makes the interpolant consistent by construction; Timmes and Swesty [3] developed this into a table interpolation for electron–positron matter. The approach needs the free energy and several of its derivatives at every node, information that most tables do not provide. Baturin et al. [5] interpolated the logarithm of pressure with quintic Hermite splines and estimated the missing derivatives by differentiating cubic splines of tabulated derivative quantities, a route that preserves the thermodynamic identities among the interpolated functions. Dilts [4] constructed consistent derivative estimates for SESAME tables by constrained local regression and reported that the consistency condition could be satisfied to round-off with third-order accuracy. A very recent preprint by Sandford and Miguel [6] builds a Helmholtz free energy that covers an existing planetary EOS table and derives all other quantities from it, and reports roughly a thousandfold improvement in thermodynamic consistency.'));
c.push(body('A user holding a legacy pressure–energy table, and wanting a consistent interpolant, faces three practical questions that the literature leaves partly open for the warm and hot dense matter regime. How much accuracy does consistency cost relative to the independent spline the user may already trust? Does raising the order of the Hermite interpolant repay the extra derivative data? And what happens when a single table spans regimes as different as a nearly ideal radiation-dominated gas and a strongly coupled, degenerate liquid, so that the table varies by many orders of magnitude from one node to the next?'));
c.push(body('This paper addresses those questions with a controlled numerical study. We make three contributions. First, we describe a reconstruction of the dimensionless free energy and of the nodal derivatives needed for bicubic and biquintic Hermite interpolation from tabulated pressure and energy only (Section 2). Second, we benchmark the resulting schemes against log-bilinear interpolation, an independent bicubic spline, and Hermite schemes that use exact derivative data, on a model plasma for which the exact thermodynamics is known, using accuracy, Maxwell-relation, entropy-closure and stability diagnostics, a Hugoniot calculation and a Lagrangian shock tube (Sections 3 and 4). Third, we identify a failure mode that appears when radiation pressure is left inside coarse tables, and we show that removing the analytically known radiation term before tabulation avoids it. We do not claim that free-energy Hermite interpolation is new [2,3]; the closest existing ideas are in [4–6]. What we add is a self-contained recipe that needs nothing beyond P and e, together with quantitative evidence on where it works and where it does not.'));

// ---- 2 Framework
c.push(H1('2. Thermodynamic framework and interpolation schemes'));
c.push(H2('2.1 Potential and identities'));
c.push(body('We work with quantities per nucleon and with the logarithmic variables <i>x</i> = ln <i>n</i> and <i>y</i> = ln <i>T</i>, where <i>n</i> is the number density of nucleons and <i>T</i> is the temperature in energy units. The specific Helmholtz free energy <i>f</i> = <i>e</i> − <i>Ts</i> is dominated at high temperature by a term of the form <i>T</i> ln(<i>nλ</i>^{3}), where <i>λ</i> is a thermal wavelength, which is much larger in magnitude than the energy <i>e</i>. Interpolating <i>f</i> and then forming <i>e</i> = <i>f</i> − <i>f</i>_{<i>y</i>} therefore loses accuracy to cancellation. We found this to be a severe effect in preliminary runs, with energy errors about fifty times larger than pressure errors. We instead interpolate the dimensionless free energy <i>φ</i> = <i>f</i>/<i>T</i>, from which [16]'));
c.push(eq('<i>P</i> = <i>n T</i> ∂<i>φ</i>/∂<i>x</i>', 1));
c.push(eq('<i>e</i> = −<i>T</i> ∂<i>φ</i>/∂<i>y</i>', 2));
c.push(eq('<i>s</i>/<i>k</i>_{B} = −<i>φ</i> − ∂<i>φ</i>/∂<i>y</i>', 3));
c.push(body('involve only first derivatives of <i>φ</i> and no cancellation. Any pair (<i>P</i>, <i>e</i>) obtained from a single smooth <i>φ</i> satisfies the Maxwell relation'));
c.push(eq('(∂<i>e</i>/∂<i>x</i>)_{<i>y</i>} = [<i>P</i> − (∂<i>P</i>/∂<i>y</i>)_{<i>x</i>}] / <i>n</i>', 4));
c.push(body('identically, because both sides equal −<i>T</i> ∂²<i>φ</i>/∂<i>x</i>∂<i>y</i>. The potential is defined only up to <i>φ</i> → <i>φ</i> + const (equivalently <i>f</i> → <i>f</i> + const·<i>T</i>), which shifts the entropy by a constant and leaves <i>P</i> and <i>e</i> unchanged. Thermodynamic stability requires (∂<i>P</i>/∂<i>n</i>)_{<i>T</i>} > 0 and a positive heat capacity, and the adiabatic derivative that determines the sound speed is'));
c.push(eq('(∂<i>P</i>/∂<i>n</i>)_{<i>s</i>} = (1/<i>n</i>)(∂<i>P</i>/∂<i>x</i>) + (∂<i>P</i>/∂<i>y</i>)² / [<i>n</i>² (∂<i>e</i>/∂<i>y</i>)]', 5));
c.push(body('We use equation (5) to measure how interpolation errors in the first derivatives propagate into a derived quantity.'));

c.push(H2('2.2 The six schemes'));
c.push(body('Table 1 lists the schemes. Two (LB, LS) interpolate pressure and energy independently. Log-bilinear interpolation (LB) is piecewise bilinear in ln <i>P</i> and ln <i>e</i> and is still the default in many hydrodynamics codes. The bicubic spline (LS) is the interpolating tensor-product cubic spline of ln <i>P</i> and ln <i>e</i> (SciPy <i>RectBivariateSpline</i> with zero smoothing), which is C² continuous. Neither guarantees equation (4). The other four schemes interpolate <i>φ</i> with tensor-product Hermite polynomials, so that <i>P</i> and <i>e</i> follow from equations (1) and (2). HC uses cubic Hermite polynomials, which need <i>φ</i>, <i>φ</i>_{<i>x</i>}, <i>φ</i>_{<i>y</i>} and <i>φ</i>_{<i>xy</i>} at each node and give C¹ continuity. HQ uses quintic Hermite polynomials, which also need <i>φ</i>_{<i>xx</i>}, <i>φ</i>_{<i>yy</i>}, <i>φ</i>_{<i>xxy</i>}, <i>φ</i>_{<i>xyy</i>} and <i>φ</i>_{<i>xxyy</i>} (nine numbers per node) and give C² continuity, as in the biquintic scheme of [2,3] but in different variables. In HC and HQ the nodal derivatives come from the analytic EOS (first and mixed derivatives analytically, higher derivatives by sixth-order differences of analytic first derivatives). They show what is achievable when exact derivative data are available, which is rarely the case in practice. We store each Hermite scheme as precomputed monomial coefficients per cell, so that a lookup is one gather and one contraction.'));
c.push(...table('<b>Table 1.</b> Interpolation schemes compared. “Input per node” is the number of tabulated values the user must supply.', ['Scheme', 'Interpolated quantity', 'Continuity', 'Input per node', 'Consistent by construction'],
  [['LB', 'ln <i>P</i>, ln <i>e</i>; bilinear', 'C⁰', '2 (<i>P</i>, <i>e</i>)', 'No'], ['LS', 'ln <i>P</i>, ln <i>e</i>; bicubic spline', 'C²', '2 (<i>P</i>, <i>e</i>)', 'No'],
   ['HC', '<i>φ</i>; bicubic Hermite', 'C¹', '4 (analytic derivatives)', 'Yes'], ['HQ', '<i>φ</i>; biquintic Hermite', 'C²', '9 (analytic derivatives)', 'Yes'],
   ['RC', '<i>φ</i>; bicubic Hermite, reconstructed', 'C¹', '2 (<i>P</i>, <i>e</i>)', 'Yes'], ['RQ', '<i>φ</i>; biquintic Hermite, reconstructed', 'C²', '2 (<i>P</i>, <i>e</i>)', 'Yes']],
  [900, 2900, 1100, 2172, 2000]));

c.push(H2('2.3 Reconstruction of the potential from P and e tables (RC and RQ)'));
c.push(body('The reconstruction takes tabulated <i>P</i>(<i>n</i>, <i>T</i>) and <i>e</i>(<i>n</i>, <i>T</i>) on a uniform grid in (<i>x</i>, <i>y</i>) and produces the nodal data of <i>φ</i>. At the nodes, equations (1) and (2) give <i>φ</i>_{<i>x</i>} = <i>P</i>/(<i>nT</i>) and <i>φ</i>_{<i>y</i>} = −<i>e</i>/<i>T</i> exactly. The potential itself is then obtained by integration. On the lowest-density column <i>x</i> = <i>x</i>_{0},'));
c.push(eq('<i>φ</i>(<i>x</i>_{0}, <i>y</i>) = <i>φ</i>(<i>x</i>_{0}, <i>y</i>_{0}) − ∫_{<i>y</i>0}^{<i>y</i>} [<i>e</i>(<i>x</i>_{0}, <i>y</i>′)/<i>T</i>′] d<i>y</i>′', 6));
c.push(body('with <i>φ</i>(<i>x</i>_{0}, <i>y</i>_{0}) chosen arbitrarily (the gauge freedom noted above), and then for every temperature'));
c.push(eq('<i>φ</i>(<i>x</i>, <i>y</i>) = <i>φ</i>(<i>x</i>_{0}, <i>y</i>) + ∫_{<i>x</i>0}^{<i>x</i>} [<i>P</i>/(<i>nT</i>)] d<i>x</i>′', 7));
c.push(body('The mixed derivative follows by differentiating the nodal values of <i>φ</i>_{<i>x</i>} along <i>y</i>, <i>φ</i>_{<i>xy</i>} ≈ D_{<i>y</i>}[<i>P</i>/(<i>nT</i>)]. For the biquintic scheme the remaining data are obtained in the same way: <i>φ</i>_{<i>xx</i>} = D_{<i>x</i>}<i>φ</i>_{<i>x</i>}, <i>φ</i>_{<i>yy</i>} = D_{<i>y</i>}<i>φ</i>_{<i>y</i>}, <i>φ</i>_{<i>xxy</i>} = D_{<i>x</i>}<i>φ</i>_{<i>xy</i>}, <i>φ</i>_{<i>xyy</i>} = D_{<i>y</i>}<i>φ</i>_{<i>xy</i>} and <i>φ</i>_{<i>xxyy</i>} = D_{<i>x</i>}<i>φ</i>_{<i>xyy</i>}, where D denotes numerical differentiation along the indicated axis. The integrals and derivatives use ten-point Lagrange stencils, one-sided near the table edges (Appendix A). The cost is one pass over the table when it is loaded.'));
c.push(body('Two properties are worth stating. The interpolant reproduces the input <i>P</i> and <i>e</i> at every node to round-off (we measured relative differences of at most 2×10^{-11}), because the nodal values of <i>φ</i>_{<i>x</i>} and <i>φ</i>_{<i>y</i>} are the tabulated ones. And the interpolant is consistent whatever the quality of the nodal data, since it is a single polynomial surface for <i>φ</i>; the data quality controls accuracy, not consistency. For an exactly consistent table the result is independent of the integration path. For a table that is only approximately consistent, the path (here, along <i>y</i> on the first column and then along <i>x</i>) selects one consistent surface out of many, and the discrepancy between paths measures the inconsistency of the input. We discuss the consequences for real tables in Section 5.'));

c.push(H2('2.4 Radiation'));
c.push(body('The blackbody contribution to the free energy is known in closed form, <i>φ</i>_{rad} = −<i>P</i>_{r}/(<i>nT</i>) with <i>P</i>_{r} = (π²/45)<i>T</i>⁴/(ħ<i>c</i>)³. Because it varies as <i>T</i>³/<i>n</i> it changes by a factor of about 2 from node to node at ten points per decade in temperature, and by a factor of about 4 at five points per decade, and it dominates the table in the hot, low-density corner. We therefore test two variants. In the “full” variant the tables contain radiation. In the “matter-only” variant the radiation term is subtracted before tabulation and added back analytically after interpolation, for all six schemes (this is the usual practice when the radiation field is in equilibrium with matter).'));

// ---- 3 Test problem
c.push(H1('3. Test problem and numerical experiments'));
c.push(H2('3.1 Model plasma'));
c.push(body('The test bed is a model equation of state for fully ionized hydrogen (<i>Z</i> = 1) in which all derivatives are known analytically. The free energy per nucleon is'));
c.push(eq('<i>f</i> = <i>T</i>[ln(<i>nλ</i>_{i}³/2) − 1] + <i>T f</i>_{ex}(Γ) + <i>Tη</i> − <i>P</i>_{e}/<i>n</i> − <i>P</i>_{r}/<i>n</i>', 8));
c.push(body('where the terms are, in order, a classical ideal gas of protons, the excess free energy of the ionic one-component plasma, an ideal non-relativistic Fermi–Dirac electron gas with degeneracy parameter <i>η</i> = <i>μ</i>_{e}/<i>T</i>, and blackbody radiation. The ion coupling parameter is Γ = <i>e</i>²/(<i>a</i>_{i}<i>T</i>) with <i>a</i>_{i} = (3/4π<i>n</i>)^{1/3}. For <i>f</i>_{ex} we use the analytic fit of Chabrier and Potekhin [9] (their equation 28), which joins the Debye–Hückel limit at small Γ to Monte Carlo results [9,11] for 1 ≤ Γ ≲ 160 and has two fitted coefficients, <i>A</i>_{1} = −0.9052 and <i>A</i>_{2} = 0.6322 (an extended fit with relativistic and solid-phase corrections is given in [10]). The Fermi–Dirac integrals of order −1/2, 1/2 and 3/2 are computed by adaptive quadrature on a dense grid in <i>η</i>, cubic-spline interpolated in logarithmic form and refined by Newton iteration for <i>η</i>(<i>n</i>, <i>T</i>), which keeps the error of the reference at the level of 10^{-10} (we use quadrature instead of the analytic approximations of [12,13] for convenience). Table 2 summarizes the model.'));
c.push(...table('<b>Table 2.</b> Model equation of state and test domain.', ['Item', 'Description'],
  [['Ions', 'Classical ideal gas of protons, <i>Z</i> = 1, <i>A</i> = 1'], ['Ion–ion correlation', 'One-component-plasma fit of Chabrier and Potekhin [9], Eq. (28); <i>A</i>_{1} = −0.9052, <i>A</i>_{2} = 0.6322'],
   ['Electrons', 'Ideal Fermi–Dirac gas, non-relativistic; <i>I</i>_{1/2} and <i>I</i>_{3/2} by quadrature'], ['Radiation', 'Blackbody, <i>P</i>_{r} = (π²/45) <i>T</i>⁴/(ħ<i>c</i>)³'],
   ['Not included', 'Bound states and ionization, pressure ionization, ion–electron screening, electron exchange–correlation, relativistic electrons (corrections of order <i>T</i>/<i>m</i>_{e}<i>c</i>² ≈ 2% at 10 keV), quantum ions, phase transitions'],
   ['Domain', '0.1 ≤ <i>ρ</i> ≤ 1000 g cm^{-3}; 10 eV ≤ <i>T</i> ≤ 10 keV'],
   ['Pressure and energy density', `<i>P</i> from ${sci(D.P_min_Pa)} to ${sci(D.P_max_Pa)} Pa; internal energy density ≥ ${sci(D.u_min_Jm3)} J m^{-3}`],
   ['Regimes covered', `Γ from ${sci(D.Gam_min)} to ${D.Gam_max.toFixed(1)} (${Math.round(100 * D.frac_Gam_gt1)}% of the log-area has Γ > 1); <i>η</i> from ${D.eta_min.toFixed(1)} to ${D.eta_max.toFixed(0)} (${Math.round(100 * D.frac_deg)}% degenerate); radiation up to ${(100 * D.rad_max).toFixed(1)}% of the pressure`]],
  [2300, 6772], { size: 18, leftCols: [1] }));
c.push(body(`The model is a test bed and not a hydrogen EOS for quantitative work: it has no atomic physics, no pressure ionization and no phase transitions, so it is smoother than any real table. Its value is that it is analytic, thermodynamically exact, and it spans the regimes that make tables hard to interpolate. Every state in the domain exceeds ${sci(D.P_min_Pa)} Pa in pressure and ${sci(D.u_min_Jm3)} J m^{-3} in energy density, well above the 10^{11} J m^{-3} that defines the high-energy-density regime (Fig. 1). We verified the analytic first derivatives and the mixed derivative against finite differences (agreement to 10^{-10} or better), the Maxwell relation (residual ≤ ${sci(R1.ref_maxwell_max)}), and stability, with no point in the domain having a negative compressibility or heat capacity.`));
c.push(...figure('figs/fig1_domain.png', '<b>Fig. 1.</b> Test domain in the density–temperature plane. Shading shows the pressure of the model plasma. Curves mark Γ = 1 (strongly coupled below), <i>μ</i>_{e} = 0 (electrons degenerate below and to the right) and <i>P</i>_{r}/<i>P</i> = 0.5 (radiation dominated above). The black curve is the principal Hugoniot used in Section 4.4, the star its initial state; open circles are the two initial states of the shock tube (Section 4.5).', 520));

c.push(H2('3.2 Tables, test points and diagnostics'));
c.push(body('Tables are uniform in ln <i>ρ</i> and ln <i>T</i> with 5, 10, 20 or 40 points per decade in both variables (the grids are nested, from 21 × 16 to 161 × 121 nodes). Errors are evaluated at 20 000 points drawn uniformly in (ln <i>ρ</i>, ln <i>T</i>) over the whole domain, with a fixed random seed. We report relative errors in <i>P</i>, in <i>e</i> and in (∂<i>P</i>/∂<i>n</i>)_{<i>s</i>}. We use three further diagnostics. The first is the Maxwell residual'));
c.push(eq('<i>r</i>_{M} = |∂<i>e</i>/∂<i>x</i> − (<i>P</i> − ∂<i>P</i>/∂<i>y</i>)/<i>n</i>| / (<i>P</i>/<i>n</i>)', 9));
c.push(body('evaluated with the analytic derivatives of each interpolant. The second is entropy closure: since <i>T</i> d<i>s</i> = d<i>e</i> + <i>P</i> d(1/<i>n</i>), the line integral of d<i>s</i> around any closed path must vanish. We integrate d<i>s</i> by Gauss–Legendre quadrature (six points per piece, with pieces split at cell boundaries) around 40 random rectangles in the (ln <i>n</i>, ln <i>T</i>) plane, with sides between 0.65 and 3.5 decades in density and between 0.43 and 2.6 decades in temperature, and report |∮d<i>s</i>| / ∮|d<i>s</i>|. For the exact EOS this quantity is 4×10^{-13} (median) and 2×10^{-12} (maximum), which is the quadrature floor of the test. The third diagnostic is the number of test points at which an interpolant has non-positive compressibility or heat capacity.'));

c.push(H2('3.3 Hugoniot'));
c.push(body('As an application that is standard in high-energy-density physics, we compute the principal Hugoniot from the initial state <i>ρ</i>_{0} = 1 g cm^{-3}, <i>T</i>_{0} = 10 eV (a node of every table) using the Rankine–Hugoniot energy equation [15]'));
c.push(eq('<i>e</i> − <i>e</i>_{0} = ½ (<i>P</i> + <i>P</i>_{0}) (1/<i>n</i>_{0} − 1/<i>n</i>)', 10));
c.push(body('solved by bisection in density at 120 temperatures between 14 eV and 9 keV, with <i>P</i> and <i>e</i> taken from each interpolant. The exact Hugoniot reaches a compression of 6.2. We report errors in the post-shock density and pressure at given temperature.'));

c.push(H2('3.4 Lagrangian shock tube'));
c.push(body('To test the effect on a simulation we use a planar one-dimensional Lagrangian scheme with von Neumann–Richtmyer artificial viscosity [14] (quadratic and linear coefficients 1.5 and 0.3), a staggered leapfrog update and a predictor–corrector energy update. The EOS is called as (<i>ρ</i>, <i>e</i>) → (<i>P</i>, <i>T</i>) by bisection on ln <i>T</i> using each scheme’s own <i>e</i>(<i>n</i>, <i>T</i>). The domain is 2 mm long with 300 cells and uniform density 1 g cm^{-3}; the left half is at 1000 eV and the right half at 10 eV, so the initial state is a pure pressure and temperature jump. We run to 1 ns in 549 steps of 1.82 ps (maximum CFL number 0.46). The same step sequence is used for all runs, so the numerical scheme is identical and any difference from the reference solution computed with the exact EOS is caused by the table interpolation alone. The solution (Fig. 6a) has a rarefaction fan, a plateau at 0.62 g cm^{-3} and about 740 eV, a contact, and a shock with compression 3.7 whose peak pressure is 2×10^{14} Pa. All states stay inside the table domain (0.61–3.7 g cm^{-3}, 10–1000 eV) and no table-edge clamping occurred.'));

// ---- 4 Results
c.push(H1('4. Results'));
c.push(H2('4.1 Accuracy with matter-only tables'));
c.push(body(`Figure 2 and Table 3 show the pressure and energy errors for matter-only tables. Log-bilinear interpolation converges at second order and has a median pressure error of ${sci(A('sub', 10, 'LB').P.med)} at ten points per decade, with a worst case of ${sci(A('sub', 10, 'LB').P.max)}. The bicubic spline converges at fourth order and is far more accurate, with median ${sci(A('sub', 10, 'LS').P.med)} and maximum ${sci(A('sub', 10, 'LS').P.max)}. Cubic Hermite interpolation of <i>φ</i> converges at third order (Table 8), because <i>P</i> and <i>e</i> are first derivatives of the interpolant, and at ten points per decade it is about five times less accurate than the spline in median pressure (${sci(A('sub', 10, 'HC').P.med)}). Accuracy therefore has a price when consistency is obtained with cubic polynomials. The quintic schemes remove it: HQ and RQ converge at about fifth order or faster in the range we tested and reach median pressure errors of ${sci(A('sub', 10, 'HQ').P.med)} and ${sci(A('sub', 10, 'RQ').P.med)}, a factor of roughly 430–520 below the spline, with worst cases of ${sci(A('sub', 10, 'HQ').P.max)} and ${sci(A('sub', 10, 'RQ').P.max)} (factors of 3500 and 50 below the spline).`));
c.push(body(`Two features of the comparison deserve comment. RC reproduces HC to the digits shown in Table 3, so for the cubic scheme the reconstruction from <i>P</i> and <i>e</i> costs nothing relative to exact derivative data. For the quintic scheme the reconstructed version matches the exact-derivative version in the median but has a heavier tail (maximum ${sci(A('sub', 10, 'RQ').P.max)} against ${sci(A('sub', 10, 'HQ').P.max)}). The error maps in Fig. 3 show where: the largest errors of RC and RQ are in the cold, dense, strongly coupled region (below the Γ = 1 line), where the free energy has the most structure, and finite-difference estimates of the second and mixed derivatives are least accurate there. The orders of convergence in Table 8 are measured between 5 and 20 points per decade; between 20 and 40 points per decade the quintic errors approach 10^{-12}, where round-off in the monomial representation and the accuracy of the reference derivatives set the floor.`));
c.push(...table('<b>Table 3.</b> Relative errors at 10 points per decade, matter-only tables, 20 000 test points: pressure (median, 99th percentile, maximum), energy (median, maximum) and the adiabatic derivative (∂<i>P</i>/∂<i>n</i>)_{<i>s</i>} (median, maximum).',
  ['Scheme', '<i>P</i> med.', '<i>P</i> 99%', '<i>P</i> max.', '<i>e</i> med.', '<i>e</i> max.', '(∂<i>P</i>/∂<i>n</i>)_{<i>s</i>} med.', '(∂<i>P</i>/∂<i>n</i>)_{<i>s</i>} max.'], tab3,
  [800, 1150, 1150, 1150, 1150, 1150, 1260, 1262], { size: 16 }));
c.push(...figure('figs/fig2_convergence.png', '<b>Fig. 2.</b> Median (left) and maximum (right) relative error in pressure against table resolution, matter-only tables. HC and RC coincide. Dotted lines indicate slopes <i>h</i>², <i>h</i>⁴ and <i>h</i>⁶ (<i>h</i> is the grid spacing); the grey horizontal line marks 10^{-12}, below which round-off and the accuracy of the reference derivatives limit the quintic schemes.', 560));
c.push(...figure('figs/fig4_errormaps.png', '<b>Fig. 3.</b> Relative pressure error over the domain at 10 points per decade (matter-only tables) for LB, LS, RC and RQ. The colour scale is logarithmic and common to all panels; the dashed white line is Γ = 1. The grid-scale striping reflects the cell structure of the tables.', 430));

c.push(H2('4.2 Thermodynamic consistency'));
c.push(body(`Table 4 and Fig. 4 give the consistency diagnostics. The independent interpolants violate the Maxwell relation by an amount that falls only slowly with resolution: the median residual of LB is ${sci(C('sub', 10, 'LB').maxwell.med)} at ten points per decade and decreases at first order, and that of LS is ${sci(C('sub', 10, 'LS').maxwell.med)} and decreases at roughly third order (Table 8). The maximum residual of LS is ${sci(C('sub', 10, 'LS').maxwell.max)}, which is not negligible compared with its pressure error, and is larger than the interpolation error itself would suggest because it involves a derivative of the interpolant. The four free-energy schemes satisfy the relation to round-off (about 10^{-16}) at every resolution. Entropy closure tells the same story: the closed-loop error is ${sci(C('sub', 10, 'LB').closure.med)} (median) for LB and ${sci(C('sub', 10, 'LS').closure.med)} for LS, and it is at or below the quadrature floor of the test for the Hermite schemes. Figure 4c shows the entropy mismatch accumulated along one loop relative to RQ: the log-bilinear interpolant ends the loop with a net entropy error of about 0.01 <i>k</i>_{B} per nucleon, and the spline’s mismatch is invisible on this scale.`));
c.push(body(`The errors in derived quantities follow the same ordering as the errors in <i>P</i> and <i>e</i> (Table 3). The median error in (∂<i>P</i>/∂<i>n</i>)_{<i>s</i>}, which sets the sound speed, is ${sci(A('sub', 10, 'LB').cs2.med)} for LB, ${sci(A('sub', 10, 'LS').cs2.med)} for LS and ${sci(A('sub', 10, 'RQ').cs2.med)} for RQ. No scheme produced a non-positive compressibility or heat capacity at any of the 20 000 test points with matter-only tables.`));
c.push(...table('<b>Table 4.</b> Thermodynamic consistency at 10 points per decade, matter-only tables: Maxwell residual <i>r</i>_{M} (median, maximum), entropy-loop closure over 40 loops (median, maximum), and the number of test points (out of 20 000) with non-positive compressibility or heat capacity. The exact EOS gives <i>r</i>_{M} ≤ 1×10^{-15} and a closure of 4×10^{-13} (median), which is the floor of the test.',
  ['Scheme', '<i>r</i>_{M} med.', '<i>r</i>_{M} max.', 'Closure med.', 'Closure max.', 'Unstable points'], tab4, [1000, 1600, 1600, 1600, 1600, 1672]));
c.push(...figure('figs/fig3_consistency.png', '<b>Fig. 4.</b> Consistency diagnostics for matter-only tables. (a) Median Maxwell residual against resolution; the four free-energy schemes lie at round-off (about 10^{-16}). (b) Median entropy-loop closure over 40 random loops; the dotted line is the quadrature floor of the test. (c) Entropy mismatch accumulated along one rectangular loop, relative to RQ and smoothed over the length of one table cell, for LB, LS and RC; the final value is the closure error of that loop. The curve for LS is too small to see on this scale.', 590));

c.push(H2('4.3 Radiation inside the table'));
c.push(body(`When the tables contain radiation the picture changes (Table 5). Every scheme loses accuracy, as expected from the steep growth of the radiation term. More importantly, the reconstructed schemes become fragile on coarse grids. At five points per decade, RC and RQ produce non-positive compressibility or heat capacity at ${C('full', 5, 'RC').viol} and ${C('full', 5, 'RQ').viol} of the 20 000 test points (about 1% of them), and their maximum energy errors reach ${sci(A('full', 5, 'RC').e.max)} and ${sci(A('full', 5, 'RQ').e.max)}, in the hot, radiation-dominated corner. HC, which has exact first and mixed derivatives, produces ${C('full', 5, 'HC').viol} unstable points, HQ none, and LB and LS none. At ten points per decade the unstable points disappear but the maximum energy error of RQ is still ${sci(A('full', 10, 'RQ').e.max)}, compared with ${sci(A('full', 10, 'LS').e.max)} for the spline, and at 20 points per decade it falls to ${sci(A('full', 20, 'RQ').e.max)}, below the spline’s ${sci(A('full', 20, 'LS').e.max)}. The reason is that, in that corner, <i>φ</i>_{<i>y</i>} ∝ −<i>T</i>³/<i>n</i> changes by a factor of 2–4 between neighbouring nodes. The quadrature of equation (6) and the high-order difference stencils are then applied to data that no ten-point polynomial represents well, and the errors enter the nodal derivatives. Median errors remain far better than for LB (RQ has a median pressure error of ${sci(A('full', 10, 'RQ').P.med)} at ten points per decade). With radiation subtracted before tabulation (Table 3) the problem does not occur, which is why we regard matter-only tables as the recommended setting for the reconstruction.`));
c.push(...table('<b>Table 5.</b> Stress test with radiation left inside the tables: pressure error (median, maximum), maximum energy error and number of unstable test points (out of 20 000) at 5 and 10 points per decade.',
  ['Scheme', '5 ppd: <i>P</i> med.', '<i>P</i> max.', '<i>e</i> max.', 'Unstable', '10 ppd: <i>P</i> med.', '<i>P</i> max.', '<i>e</i> max.', 'Unstable'], tab5,
  [800, 1150, 1000, 1000, 880, 1150, 1000, 1000, 1092], { size: 16 }));

c.push(H2('4.4 Hugoniot'));
c.push(body(`Figure 5 and Table 6 show the Hugoniot errors. The ordering of the schemes is the same as for the point-wise errors, as it should be, since the Hugoniot condition involves <i>e</i> and <i>P</i> at the same state. At ten points per decade (matter-only tables) the maximum error in the post-shock density along the Hugoniot is ${sci(H('sub', 10, 'LB').rho_max)} for LB, ${sci(H('sub', 10, 'LS').rho_max)} for LS, ${sci(H('sub', 10, 'HC').rho_max)} for HC and RC, and ${sci(H('sub', 10, 'RQ').rho_max)} for RQ. The error is largest at the cold end of the curve (temperatures below about 30 eV, compression 1.6–2.6), where the Hugoniot passes through the strongly coupled region in which the interpolation errors of Fig. 3 are largest, and it falls by about two orders of magnitude toward the hot end.`));
c.push(...figure('figs/fig5_hugoniot.png', '<b>Fig. 5.</b> (Left) Model Hugoniot from 1 g cm^{-3} and 10 eV, pressure against density, with temperature on the right axis. (Right) Relative error in the post-shock density against Hugoniot temperature for the six schemes at 10 points per decade, matter-only tables; errors are floored at 10^{-13} for display.', 560));

c.push(H2('4.5 Shock tube'));
c.push(body(`In the shock tube (Fig. 6, Table 6) the L1 error in density at 1 ns is ${sci(R3.sub10.LB.rho_L1)} for LB, ${sci(R3.sub10.LS.rho_L1)} for LS, ${sci(R3.sub10.HC.rho_L1)} for HC and RC, ${sci(R3.sub10.HQ.rho_L1)} for HQ and ${sci(R3.sub10.RQ.rho_L1)} for RQ at ten points per decade; at five points per decade the values are ${sci(R3.sub5.LB.rho_L1)}, ${sci(R3.sub5.LS.rho_L1)}, ${sci(R3.sub5.HC.rho_L1)}, ${sci(R3.sub5.HQ.rho_L1)} and ${sci(R3.sub5.RQ.rho_L1)}, in the same order. The largest local errors are at the shock and the contact, where the state changes by an order of magnitude over a few cells and where the maximum temperature error of LB reaches ${sci(R3.sub5.LB.T_max)} on the coarse table. Relative to log-bilinear lookup the biquintic reconstruction reduces the L1 density error by factors of about 4×10^{4} (ten points per decade) and 6×10^{3} (five points per decade). Relative to the spline the gain is smaller, about 15 and 28.`));
c.push(body(`We caution against over-interpreting the shock-tube comparison. The spline, which violates equation (4), gave smaller hydrodynamic errors than the consistent cubic scheme in this problem, because it is more accurate point-wise. In other words, in a smooth flow like this one the interpolation error dominates, and the consistency defect of the spline was not the leading source of error. The benefit of consistency is a guarantee (no spurious entropy source from the interpolant, correct thermodynamic derivatives to the accuracy of <i>φ</i>) rather than a measured advantage in this test. A flow with long-lived compression and expansion cycles, where small entropy errors accumulate, would be a more demanding test of consistency, and we have not run one.`));
c.push(...table('<b>Table 6.</b> Hugoniot and shock-tube errors for matter-only tables at 5 and 10 points per decade (ppd): maximum relative error in post-shock density and pressure along the Hugoniot; L1 relative error in density and maximum relative error in temperature in the shock tube at 1 ns.',
  ['Scheme', '<i>ρ</i>_{H} max. (5)', '<i>ρ</i>_{H} max. (10)', '<i>P</i>_{H} max. (5)', '<i>P</i>_{H} max. (10)', '<i>ρ</i> L1 (5)', '<i>ρ</i> L1 (10)', '<i>T</i> max. (5)', '<i>T</i> max. (10)'], tab6,
  [800, 1040, 1040, 1040, 1040, 1000, 1000, 1056, 1056], { size: 15 }));
c.push(body(`For completeness, with radiation left inside the tables at ten points per decade the Hugoniot density error (maximum) is ${sci(H('full', 10, 'LB').rho_max)} (LB), ${sci(H('full', 10, 'LS').rho_max)} (LS), ${sci(H('full', 10, 'HQ').rho_max)} (HQ) and ${sci(H('full', 10, 'RQ').rho_max)} (RQ), and the shock-tube L1 density errors are ${sci(R3.full10.LB.rho_L1)}, ${sci(R3.full10.LS.rho_L1)}, ${sci(R3.full10.HQ.rho_L1)} and ${sci(R3.full10.RQ.rho_L1)}; the maximum Hugoniot errors of LS and RQ in that case occur at the hot end of the curve (9 keV), where radiation dominates.`));
c.push(...figure('figs/fig6_shocktube.png', '<b>Fig. 6.</b> Shock tube at 1 ns. (a) Reference solution computed with the exact EOS: density (solid) and temperature (dashed). (b) Relative density error of each scheme against the reference at 5 points per decade (matter-only tables); errors are floored at 10^{-13}. HC and RC nearly coincide.', 560));

c.push(H2('4.6 Cost'));
c.push(body(`Table 7 lists storage and lookup time. The Hermite schemes need more stored numbers per node (four for the cubic scheme, nine for the quintic scheme) but with RC and RQ these are computed once at load time from two tabulated values, so the table on disk is no larger than a legacy P–e table. In our NumPy implementation on a single CPU core, a million random lookups took ${T.LB.toFixed(3)} s with LB and ${T.RQ.toFixed(3)} s with RQ, a ratio of about ${rel('RQ')}. These timings are specific to this implementation and should be read as relative costs; the direct evaluation of our model EOS (vectorised, with tabulated Fermi–Dirac integrals) took ${T.REF_per_1e6.toFixed(2)} s per million points and is far cheaper than a realistic EOS model, so we draw no conclusion about the speed advantage of tabulation.`));
c.push(...table('<b>Table 7.</b> Storage and lookup cost. “Stored per node” is the number of values held in memory after loading. Time is for 10^{6} random lookups of <i>P</i> and <i>e</i> (best of three, NumPy, one core), with the ratio to LB in parentheses.',
  ['Scheme', 'Input per node', 'Stored per node', 'Time [s] (ratio)'], tab7, [2600, 1900, 1900, 2672]));
c.push(...table('<b>Table 8.</b> Observed convergence orders between 5 and 20 points per decade, matter-only tables: median and maximum pressure error, median energy error, and Maxwell residual (independent schemes only; the others are at round-off). The orders for HQ and RQ are partly pre-asymptotic and are limited by round-off at finer resolution.',
  ['Scheme', '<i>P</i> median', '<i>P</i> maximum', '<i>e</i> median', 'Maxwell median'], tab8, [1600, 1800, 1800, 1800, 2072]));

// ---- 5 Discussion
c.push(H1('5. Discussion'));
c.push(body('<b>What consistency buys.</b> Consistency does not by itself make an interpolant accurate. It guarantees that the interpolated <i>P</i> and <i>e</i> are derivatives of one potential, so that derived quantities such as the entropy, the adiabatic exponent and the sound speed are mutually compatible, and that an isentropic path cannot gain or lose entropy because of the interpolant alone. Our results show the trade-off clearly. With cubic Hermite polynomials the guarantee costs accuracy relative to an independent spline; with quintic polynomials it comes with a large accuracy gain. In the shock tube the spline’s inconsistency did not cause visible harm, which is consistent with the small Maxwell residuals of a fourth-order interpolant at this resolution, but the residual does not shrink faster than third order and its maximum is more than two orders of magnitude above its median.'));
c.push(body('<b>Practical recommendations.</b> From these tests, a user with a legacy P–e table could proceed as follows. Remove any analytically known, steeply varying contribution (the radiation term here) before tabulating, and add it back after interpolation. Use at least ten points per decade in each variable when applying the quintic reconstruction. After reconstruction, evaluate the compressibility and heat capacity on a mesh finer than the table and, where they are not positive, fall back to a robust scheme (LB or LS) in the affected cells. If the table cannot be refined or is noisy, the independent spline remains a competitive choice, and its inconsistency should be monitored with the Maxwell residual and the entropy-closure test described here.'));
c.push(body('<b>Relation to earlier work.</b> The consistency argument and the use of Hermite interpolation of a free energy are due to Swesty [2] and Timmes and Swesty [3]. Baturin et al. [5] arrive at a quintic Hermite scheme by interpolating pressure and estimating the missing derivatives from spline differentiation of tabulated derivative quantities; Dilts [4] gives consistent derivative estimates by constrained regression and shows that the consistency condition can be met to round-off; Sandford and Miguel [6] build a free energy from an existing table. Our reconstruction is close in spirit to these. It differs in working with the dimensionless free energy <i>φ</i> = <i>f</i>/<i>T</i>, in using only <i>P</i> and <i>e</i> as input, and in the quantitative study of accuracy, consistency and stability in the warm and hot dense regime. We have not compared with the methods of [4] and [6] directly and cannot say which is more accurate on real tables.'));
c.push(body('<b>Limitations.</b> The most important limitation is that our test plasma is analytic and smooth. Real tables contain ionization and dissociation regions, phase boundaries and, for first-principles tables, statistical noise. High-order finite differences amplify noise, and the reconstruction would inherit this; a smoothing or regularised differentiation step (for example local constrained regression as in [4]) would be needed, and we have not tested it. For an inconsistent table the reconstructed surface depends on the integration path of equations (6) and (7). We have not examined how much, and the discrepancy between paths could itself serve as an inconsistency measure. The method assumes a rectangular grid uniform in the logarithmic variables. The tests use a single smooth analytic model with no experimental data, a single planar test flow, and one table layout, and the quantitative results (for example the factor of 400 over the spline) are specific to that model and resolution. Finally, a table of the quality assumed here, that is a thermodynamically exact reference on a ten-points-per-decade grid, is rarely available, so absolute error levels on real tables will be higher.'));

// ---- 6 Conclusions
c.push(H1('6. Conclusions'));
c.push(body(`We have reconstructed a dimensionless free energy and its nodal derivatives from tabulated pressure and energy only, and used it for bicubic and biquintic Hermite interpolation that is thermodynamically consistent by construction. On a model plasma spanning 0.1–1000 g cm^{-3} and 10 eV–10 keV, and with radiation handled analytically, the biquintic version reached a median pressure error of ${sci(A('sub', 10, 'RQ').P.med)} at ten points per decade, against ${sci(A('sub', 10, 'LS').P.med)} for an independent bicubic spline and ${sci(A('sub', 10, 'LB').P.med)} for log-bilinear interpolation, with Maxwell and entropy-closure residuals at round-off. In a Hugoniot calculation and a shock tube it reduced table-induced errors by three to five orders of magnitude relative to log-bilinear lookup. The cubic version is consistent but less accurate than the spline, so consistency should not be expected to improve accuracy without raising the order. Radiation left inside coarse tables is the main failure mode and can generate thermodynamically unstable cells; subtracting it before tabulation removes the problem. The next steps are to test the method on real tables (SESAME or first-principles tables for deuterium), to add noise-robust differentiation, and to examine long isentropic cycles where small entropy errors accumulate.`));

// ---- Declarations
c.push(H1('Declarations'));
c.push(body('<b>Declaration of generative AI use.</b> [To be confirmed by the authors.] During the preparation of this work the authors used Claude (Anthropic) to write and run the numerical experiments, produce the figures and draft the manuscript text. The authors reviewed and edited the output and take full responsibility for the content of the publication.'));
c.push(body('<b>Data and code availability.</b> All scripts (Python/NumPy/SciPy), result files and figures needed to reproduce the results are provided in the accompanying archive [replace with a repository link or DOI before submission]. Software versions: NumPy 2.4.4, SciPy 1.17.1, SymPy 1.14.0, Matplotlib 3.10.8.'));
c.push(body('<b>Author contributions, funding and competing interests.</b> [To be completed by the authors.]'));

// ---- References
c.push(H1('References'));
const refs = [
  'S.P. Lyon, J.D. Johnson (Eds.), SESAME: The Los Alamos National Laboratory Equation of State Database, Los Alamos National Laboratory Report LA-UR-92-3407, 1992.',
  'F.D. Swesty, Thermodynamically consistent interpolation for equation of state tables, J. Comput. Phys. 127 (1996) 118.',
  'F.X. Timmes, F.D. Swesty, The accuracy, consistency, and speed of an electron-positron equation of state based on table interpolation of the Helmholtz free energy, Astrophys. J. Suppl. Ser. 126 (2000) 501–516.',
  'G.A. Dilts, Consistent thermodynamic derivative estimates for tabular equations of state, Phys. Rev. E 73 (2006) 066704.',
  'V.A. Baturin, W. Däppen, A.V. Oreshina, S.V. Ayukov, A.B. Gorshkov, Interpolation of equation-of-state data, Astron. Astrophys. (2019), arXiv:1905.08303.',
  'E. Sandford, Y. Miguel, Thermodynamically consistent equation of state tables for use in giant planet and brown dwarf interior modeling, arXiv:2610.18982 (2026), preprint.',
  'S.X. Hu, B. Militzer, V.N. Goncharov, S. Skupsky, First-principles equation-of-state table of deuterium for inertial confinement fusion applications, Phys. Rev. B 84 (2011) 224109.',
  'D.I. Mihaylov, V.V. Karasiev, S.X. Hu, J.R. Rygg, V.N. Goncharov, G.W. Collins, Improved first-principles equation-of-state table of deuterium for high-energy-density science applications, Phys. Rev. B 104 (2021) 144104.',
  'G. Chabrier, A.Y. Potekhin, Equation of state of fully ionized electron-ion plasmas, Phys. Rev. E 58 (1998) 4941.',
  'A.Y. Potekhin, G. Chabrier, Equation of state of fully ionized electron-ion plasmas. II. Extension to relativistic densities and to the solid phase, Phys. Rev. E 62 (2000) 8554–8563.',
  'H. DeWitt, W. Slattery, G. Chabrier, Physica B 228 (1996) 158.',
  'H.M. Antia, Astrophys. J. Suppl. Ser. 84 (1993) 101.',
  'S.I. Blinnikov, N.V. Dunina-Barkovskaya, D.K. Nadyozhin, Astrophys. J. Suppl. Ser. 106 (1996) 171.',
  'J. von Neumann, R.D. Richtmyer, A method for the numerical calculation of hydrodynamic shocks, J. Appl. Phys. 21 (1950) 232–237.',
  'Ya.B. Zel’dovich, Yu.P. Raizer, Physics of Shock Waves and High-Temperature Hydrodynamic Phenomena, Dover, Mineola, 2002.',
  'L.D. Landau, E.M. Lifshitz, Statistical Physics, Part 1, Pergamon, Oxford, 1980.',
];
refs.forEach((r, i) => c.push(new Paragraph({ children: [new TextRun({ text: `[${i + 1}]`, font: FONT, size: 20 }), new TextRun({ children: [new Tab()], font: FONT, size: 20 }), ...rich(r, { size: 20 })], spacing: { after: 70 }, indent: { left: 500, hanging: 500 }, tabStops: [{ type: TabStopType.LEFT, position: 500 }], alignment: AlignmentType.LEFT })));

// ---- Appendix
c.push(H1('Appendix A. Reconstruction algorithm'));
c.push(body('Input: a uniform grid in <i>x</i> = ln <i>n</i> and <i>y</i> = ln <i>T</i> with spacings <i>h</i>_{<i>x</i>} and <i>h</i>_{<i>y</i>}, and tables <i>P</i>_{<i>ij</i>}, <i>e</i>_{<i>ij</i>}. Output: nodal data of <i>φ</i> for Hermite interpolation.'));
['Compute <i>φ</i>_{<i>x</i>} = <i>P</i>/(<i>nT</i>) and <i>φ</i>_{<i>y</i>} = −<i>e</i>/<i>T</i> at all nodes.',
 'Integrate <i>φ</i>_{<i>y</i>} along <i>y</i> on the first column (lowest density), cell by cell with a ten-point Lagrange quadrature rule (one-sided near the ends of the column), starting from <i>φ</i> = 0; this gives <i>φ</i>(<i>x</i>_{0}, <i>y</i>_{<i>j</i>}) (equation 6).',
 'For each temperature index <i>j</i>, integrate <i>φ</i>_{<i>x</i>} along <i>x</i> in the same way and add the column value to obtain <i>φ</i>_{<i>ij</i>} (equation 7).',
 'Compute <i>φ</i>_{<i>xy</i>} by differentiating <i>φ</i>_{<i>x</i>} along <i>y</i> with a ten-point Lagrange derivative stencil (centred in the interior, one-sided within five nodes of the edges). For the biquintic scheme also compute <i>φ</i>_{<i>xx</i>} = D_{<i>x</i>}<i>φ</i>_{<i>x</i>}, <i>φ</i>_{<i>yy</i>} = D_{<i>y</i>}<i>φ</i>_{<i>y</i>}, <i>φ</i>_{<i>xxy</i>} = D_{<i>x</i>}<i>φ</i>_{<i>xy</i>}, <i>φ</i>_{<i>xyy</i>} = D_{<i>y</i>}<i>φ</i>_{<i>xy</i>} and <i>φ</i>_{<i>xxyy</i>} = D_{<i>x</i>}<i>φ</i>_{<i>xyy</i>}.',
 'For every cell, form the 16 (cubic) or 36 (quintic) monomial coefficients of the tensor-product Hermite polynomial from the corner data scaled by <i>h</i>_{<i>x</i>}^{<i>p</i>}<i>h</i>_{<i>y</i>}^{<i>q</i>}, and store them.',
 'At a query point (<i>x</i>, <i>y</i>), locate the cell, gather its coefficients, and evaluate <i>φ</i>_{<i>x</i>} and <i>φ</i>_{<i>y</i>}; return <i>P</i> = <i>nT φ</i>_{<i>x</i>} and <i>e</i> = −<i>T φ</i>_{<i>y</i>}. Second derivatives for stability checks and the sound speed follow from the same coefficients.',
].forEach((t, i) => c.push(new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: rich(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 } })));
c.push(body('The analytic nodal data used for HC and HQ are obtained from the model free energy: <i>φ</i>_{<i>x</i>} = <i>P</i>/(<i>nT</i>), <i>φ</i>_{<i>y</i>} = −<i>e</i>/<i>T</i>, <i>φ</i>_{<i>xy</i>} = (<i>f</i>_{<i>xy</i>} − <i>f</i>_{<i>x</i>})/<i>T</i> (with analytic <i>f</i>_{<i>xy</i>} from the ion, electron and radiation terms), and the second and higher derivatives by sixth-order central differences (step 0.02 in the logarithmic variables) of these analytic first and mixed derivatives.', { spacing: { before: 120, after: 120, line: 276 } }));

// ------------------------------------------------------------------ document
const doc = new Document({
  creator: 'Draft manuscript', title: 'Thermodynamically consistent interpolation of equation-of-state tables',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync('/mnt/user-data/outputs/EOS_consistent_interpolation_manuscript.docx', b); console.log('written', b.length); });
