# Piano Sheet Player (Static Demo)

Modern, app-like **HTML/CSS/JS** UI inspired by a piano sheet player dashboard:

- Upload / drag & drop panel (demo only)
- Sample song list (demo only)
- Transport controls + tempo/volume sliders
- On-screen piano keyboard (mouse + QWERTY)
- Optional **Web MIDI input** (Chrome/Edge)

## Run

Any static server works. Examples:

### Python

```bash
cd piano-sheet-player
python -m http.server 5173
```

Then open `http://localhost:5173/index.html`.

### Node (if you have it)

```bash
cd piano-sheet-player
npx serve .
```

## Controls

- Click keys to play
- QWERTY: `A W S E D F T G Y H U J K ...`
- Hold `Shift` for sustain (like a pedal)
- Space: play/pause (demo)

