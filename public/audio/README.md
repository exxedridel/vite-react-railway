# Audio del juego

## Wild Pokémon Captured

`wild-pokemon-captured.wav` es una interpretación sintetizada de la partitura
`mus_caught.mid` de Pokémon FireRed / LeafGreen. Es la pista `MUS_CAUGHT` (322,
nombre anterior `MUS_GET_YASEI`), distinta de `MUS_VICTORY_WILD`.

- Partitura original conservada en `wild-pokemon-captured-original.mid`.
- Fuente: [pret/pokefirered, mus_caught.mid](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/sound/songs/midi/mus_caught.mid).
- Identificación: [constantes musicales del proyecto original](https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/include/constants/songs.h).
- La composición pertenece a la banda sonora de Pokémon; crédito a
  Pokémon / Nintendo / Creatures / GAME FREAK. La disponibilidad del MIDI en ese
  repositorio no convierte la composición en una obra con licencia libre.
- La síntesis usa osciladores propios, sin muestras de ROM ni SoundFont. Mantiene
  las notas y el tempo del MIDI; las voces son una interpretación chiptune y no
  una grabación original de la consola.

El WAV se genera sin instalar dependencias:

```powershell
node tools/render-capture-midi.mjs
node tools/render-capture-midi.mjs --inspect
```

Formato: PCM firmado de 16 bits, mono, 22 050 Hz, 614 294 bytes.
Duración y fin del bucle: `13.928571428571429` segundos. Inicio del bucle:
`0.21428571428571427` segundos. Los límites proceden de los marcadores `[` y `]`
del MIDI, redondeados a muestras enteras; se aplica una rampa de 2 ms para evitar
chasquidos al repetir. El reproductor debe detener esta pista al cerrar la
presentación de captura.

SHA-256 del MIDI: `FA84E5283E36BDED6B2416D689D2BFF1BA9D7370CB40F99C2686F09C46F0CE00`.
SHA-256 del WAV: `5F61F16553E90C94F0C97F7FB5A4B85F2F5456B12C5D6D95E9AD6A172D6E0741`.

## Trainer Battle

Los archivos `trainer-battle-original.mid`, `trainer-battle.wav` y el generador
`tools/render-battle-midi.py` ya formaban parte del repositorio. Esta incorporación
no modifica esa pista ni su reproducción.
