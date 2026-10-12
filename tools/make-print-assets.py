#!/usr/bin/env python3
"""Prepara le immagini per il kit stampabile (stampa/img). Da lanciare solo se cambiano gli originali.
Uso: python3 tools/make-print-assets.py /percorso/Arena-Extinctio-Regolamento
- le carte originali hanno rapporto 673×1051 (0,640), la carta da poker è 63,5×88,9 mm (0,714): senza deformare niente si allarga la tela ai lati
  con il colore della cornice (arancio Skill, viola Materiali, nero Armi, bianco Personaggi);
- le tessere restano esagoni (ritaglio con CSS)."""
import sys, glob, os
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else '../Arena-Extinctio-Regolamento'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'stampa', 'img')
TILE_ORDER = [7,8,9,10,11,12,20,21,22,23,24,25,26,27,28,29,30,31,13,14,15,16,17,18,19,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,1,2,3,4,5,6,58,59,60,61]
CARDS = {
  'Armi': ['back','xas','foolshift','ourban','softlyne','cratter','tua','elindea','here','clone','ujsutom','freemind','shapeliar','mod_mun','mod_dan','mod_git','sunstone','abyss'],
  'Materiali': ['back','vetro','uranio','minerale','cibo','medikit'],
  'Skill': ['back','teletrasporto','repeat','tempo','scudo','mira','trappola','torretta','colpo','tempesta','munizioni','sindaco','fabbro','ladro','risucchio','vantaggio','svantaggio','mina','zaino','sfera'],
  'V2': ['back','godnocy','hatci','karou','kone','lasep','miaika','nganga','ricca','sejhnam','soshito'],
}
W, H = 750, 1050   # 63,5 × 88,9 mm a ~300 dpi
os.makedirs(OUT + '/cards', exist_ok=True); os.makedirs(OUT + '/tiles', exist_ok=True)
def files(p): return sorted(glob.glob(os.path.join(SRC, p + '*.png')))
n = 0
for pref, names in CARDS.items():
    fs = files(pref); assert len(fs) == len(names), pref
    for f, nm in zip(fs, names):
        im = Image.open(f).convert('RGB'); w, h = im.size
        s = H / h; im = im.resize((round(w * s), H), Image.LANCZOS)
        bg = Image.new('RGB', (W, H), im.getpixel((0, H // 2)))
        bg.paste(im, ((W - im.size[0]) // 2, 0))
        name = ('back_' + pref.lower()) if nm == 'back' else nm
        bg.save(f'{OUT}/cards/{name}.jpg', quality=84, optimize=True); n += 1
tf = files('Mappa'); assert len(tf) == 61
for f, k in zip(tf, TILE_ORDER):
    im = Image.open(f).convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.getchannel('A'))
    bg.thumbnail((900, 900), Image.LANCZOS); bg.save(f'{OUT}/tiles/t{k:02d}.jpg', quality=84, optimize=True); n += 1
print(n, 'immagini in', OUT)
