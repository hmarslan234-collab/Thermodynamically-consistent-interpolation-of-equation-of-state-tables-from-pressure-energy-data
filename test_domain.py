import numpy as np, eos as E
xs=np.linspace(E.rho_to_x(0.1),E.rho_to_x(1000.),161); ys=np.linspace(np.log(10.),np.log(1e4),121)
X,Y=np.meshgrid(xs,ys,indexing='ij')
r=E.eos(X,Y); fxx,fyy=E.eos_second(X,Y)
P=r['P']; e=r['e']
print('min e',e.min(),'min P',P.min(), 'min fx',r['fx'].min())
comp=r['fx']+fxx; cv=(r['fy']-fyy)/r['T']
print('min compress (Px/n)',comp.min(),'min Cv',cv.min())
print('Gamma range',r['Gam'].min(),r['Gam'].max())
print('eta range',r['eta'].min(),r['eta'].max())
Ppa=P*E.EVCM3_PA
print('P range Pa',Ppa.min(),Ppa.max()); print('frac P>1e11 Pa', (Ppa>1e11).mean())
rad=r['Pr_n']/r['fx']; print('rad frac max',rad.max(), 'frac>0.5',(rad>0.5).mean())
# energy density (total) J/m3 : u = n*e (+ nothing) 
u=(r['n']*e)*E.EVCM3_PA; print('frac u>1e11',(u>1e11).mean(), 'umin',u.min())
print('Gamma>1 frac',(r['Gam']>1).mean(),' degenerate eta>0 frac',(r['eta']>0).mean())
