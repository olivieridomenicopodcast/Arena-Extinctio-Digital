#!/usr/bin/env python3
"""Converte le immagini originali (repo Arena-Extinctio-Regolamento) in WebP leggeri per l'app.
Uso: python3 tools/make-assets.py /percorso/Arena-Extinctio-Regolamento
Gli originali NON sono copiati nel repo digitale (pesano ~130 MB): restano nel repo del regolamento."""
import sys, glob, os
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '../Arena-Extinctio-Regolamento'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')

# ordine alfabetico dei file "Mappa - ..." -> numero stampato sulla tessera
TILE_ORDER = [7,8,9,10,11,12,20,21,22,23,24,25,26,27,28,29,30,31,13,14,15,16,17,18,19,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,1,2,3,4,5,6,58,59,60,61]
CARDS = {
  'Armi': ['back','xas','foolshift','ourban','softlyne','cratter','tua','elindea','here','clone','ujsutom','freemind','shapeliar','mod_mun','mod_dan','mod_git','sunstone','abyss'],
  'Materiali': ['back','vetro','uranio','minerale','cibo','medikit'],
  'Skill': ['back','teletrasporto','repeat','tempo','scudo','mira','trappola','torretta','colpo','tempesta','munizioni','sindaco','fabbro','ladro','risucchio','vantaggio','svantaggio','mina','zaino','sfera'],
  'V2': ['back','godnocy','hatci','karou','kone','lasep','miaika','nganga','ricca','sejhnam','soshito'],
}
def files(prefix):
    return sorted(glob.glob(os.path.join(SRC, prefix + '*.png')))
def save(im, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', **kw)
    print(os.path.relpath(path, OUT), os.path.getsize(path) // 1024, 'KB')

tf = files('Mappa')
assert len(tf) == 61 and sorted(TILE_ORDER) == list(range(1, 62))
for f, n in zip(tf, TILE_ORDER):
    im = Image.open(f).convert('RGBA'); im.thumbnail((360, 360))
    save(im, f'{OUT}/tiles/t{n:02d}.webp', quality=82, method=6)
for pref, names in CARDS.items():
    fs = files(pref)
    assert len(fs) == len(names), (pref, len(fs))
    for f, nm in zip(fs, names):
        im = Image.open(f).convert('RGB'); im = im.resize((420, round(420 * im.size[1] / im.size[0])), Image.LANCZOS)
        save(im, f'{OUT}/cards/{"back_" + pref.lower() if nm == "back" else nm}.webp', quality=80, method=6)
bg = Image.open(files('4_')[0]).convert('RGB'); bg.thumbnail((1400, 1400)); save(bg, f'{OUT}/bg.webp', quality=65, method=6)
lg = Image.open(files('3_')[0]).convert('RGBA'); lg.thumbnail((640, 640)); save(lg, f'{OUT}/logo.webp', quality=85, method=6)
