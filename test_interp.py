import numpy as np, time
from interp import *
import eos as E, tables as T
# 1. polynomial reproduction test of Hermite (cubic reproduces deg<=3, quintic deg<=5)
g = Grid(0,0,0.3,0.4,6,6)
xs,ys=np.meshgrid(g.xs,g.ys,indexing='ij')
for m,deg in [(1,3),(2,5)]:
    rng=np.random.default_rng(1); c=rng.normal(size=(deg+1,deg+1))
    def f(a,b,da=0,db=0):
        pa=np.polynomial.polynomial.polyder(np.eye(deg+1),da,axis=1) if da else np.eye(deg+1)
        out=0
        A=np.polynomial.polynomial.polyval(a,np.polynomial.polynomial.polyder(np.eye(deg+1)[:,:],0)[0]) if False else None
        # direct evaluation
        s=0
        for i in range(deg+1):
            for j in range(deg+1):
                ci=c[i,j]
                ti=np.polynomial.polynomial.polyval(a,np.polynomial.polynomial.polyder(np.eye(deg+1)[i],da)) if da else a**i
                tj=np.polynomial.polynomial.polyval(b,np.polynomial.polynomial.polyder(np.eye(deg+1)[j],db)) if db else b**j
                s=s+ci*ti*tj
        return s
    D={(p,q):f(xs,ys,p,q) for p in range(m+1) for q in range(m+1)}
    H=HermiteF(g,D,m,'t')
    xq=rng.uniform(0,1.5,200); yq=rng.uniform(0,2.0,200)
    r=H._multi(xq,yq,[(0,0),(1,0),(0,1),(1,1)])
    print('m',m,'poly reproduction err', max(np.abs(r[(0,0)]-f(xq,yq)).max(),np.abs(r[(1,0)]-f(xq,yq,1,0)).max(),np.abs(r[(1,1)]-f(xq,yq,1,1)).max()))
# 2. accuracy on EOS at ppd=10
t0=time.time()
for ppd in (10,):
    g,M,P,e=T.build(ppd)
    rng=np.random.default_rng(0)
    x=rng.uniform(T.X0,T.X0+4*np.log(10),20000); y=rng.uniform(T.Y0,T.Y0+3*np.log(10),20000)
    r=E.eos(x,y); Pt=r['P']; et=r['e']
    for k,m in M.items():
        o=m.eval(x,y)
        print(ppd,k,'P med %.2e max %.2e | e med %.2e max %.2e'%(np.median(abs(o['P']/Pt-1)),abs(o['P']/Pt-1).max(),np.median(abs(o['e']/et-1)),abs(o['e']/et-1).max()))
# M4 nodes reproduce P,e exactly?
g,M,P,e=T.build(10)
X,Y=np.meshgrid(g.xs,g.ys,indexing='ij')
o=M['M4'].eval(X.ravel()+1e-12,Y.ravel()+1e-12)
print('M4 node P err',abs(o['P']/P.ravel()-1).max(),'e err',abs(o['e']/e.ravel()-1).max())
print('time',time.time()-t0)
