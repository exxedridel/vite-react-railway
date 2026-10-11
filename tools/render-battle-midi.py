import mido,numpy as np
from scipy.io.wavfile import write
from pathlib import Path
root = Path(__file__).resolve().parents[1]
m=mido.MidiFile(root / 'public/audio/trainer-battle-original.mid')
sr=22050;tempo=.351699;ticksec=tempo/480
start=1920;loop=21120;end=134400
length=round((end-start)*ticksec*sr)
out=np.zeros(length,dtype=np.float64)
for index,track in enumerate(m.tracks[1:]):
 tick=0;active={};notes=[];cc7=[(0,100)];cc1=[(0,0)]
 for e in track:
  tick+=e.time
  if e.type=='control_change':
   if e.control==7:cc7.append((tick,e.value))
   if e.control==1:cc1.append((tick,e.value))
  if e.type=='note_on' and e.velocity:active.setdefault(e.note,[]).append((tick,e.velocity))
  elif e.type=='note_off' or (e.type=='note_on' and not e.velocity):
   if active.get(e.note):
    begin,vel=active[e.note].pop(0);notes.append((begin,tick,e.note,vel))
 times=np.arange(length)/sr+start*ticksec
 c7=np.array(cc7);c1=np.array(cc1)
 volume=c7[np.maximum(0,np.searchsorted(c7[:,0]*ticksec,times,side='right')-1),1]/127
 mod=c1[np.maximum(0,np.searchsorted(c1[:,0]*ticksec,times,side='right')-1),1]/127
 trackpcm=np.zeros(length)
 for begin,finish,note,vel in notes:
  if finish<=start or begin>=end:continue
  lo=max(0,round((begin-start)*ticksec*sr));hi=min(length,round((finish-start)*ticksec*sr))
  if hi<=lo:continue
  seconds=np.arange(hi-lo)/sr
  freq=440*2**((note-69)/12)
  vibrato=.25*mod[lo:hi]*np.sin(2*np.pi*5.5*times[lo:hi])
  phase=2*np.pi*np.cumsum(freq*2**(vibrato/12))/sr
  wave=np.zeros(hi-lo)
  for harmonic in range(1,min(31,int((sr*.45)/freq))+1,2):wave+=np.sin(harmonic*phase)/harmonic
  env=np.minimum(1,seconds/.002)*np.minimum(1,(hi-lo-np.arange(hi-lo))/sr/.003)
  trackpcm[lo:hi]+=wave*env*(vel/127)
 out+=trackpcm*volume*[.7,.55,.65][index]
# Remove clicks exactly at the wrap point, without a perceptible gap.
fade=round(.002*sr);ls=round((loop-start)*ticksec*sr)
out[ls:ls+fade]*=np.linspace(0,1,fade)
out[-fade:]*=np.linspace(1,0,fade)
out*=.8/max(abs(out))
path=root / 'public/audio/trainer-battle.wav'
write(path,sr,(out*32767).astype(np.int16))
print({'duration':len(out)/sr,'loopStart':ls/sr,'loopEnd':len(out)/sr,'peak':float(max(abs(out))),'bytes':path.stat().st_size})
