# Audio Files

Place your audio files here for spatial audio and sound effects.

## Supported Formats

- **MP3** - Widely supported, compressed
- **OGG** - Good compression, open format
- **WAV** - Uncompressed, high quality

## Loading Audio

```javascript
// Create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// Create a global audio source
const sound = new THREE.Audio(listener);

// Load a sound and set it as the Audio object's buffer
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/public/assets/audio/sound.mp3', (buffer) => {
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
    sound.play();
});
```

## Positional Audio

```javascript
// Create a positional audio object
const sound = new THREE.PositionalAudio(listener);

audioLoader.load('/public/assets/audio/sound.mp3', (buffer) => {
    sound.setBuffer(buffer);
    sound.setRefDistance(20);
    sound.play();
});

// Attach to a mesh
mesh.add(sound);
```

## Recommended Sources

- [Freesound](https://freesound.org/) - Community sound library
- [Free Music Archive](https://freemusicarchive.org/) - Free music
- [Incompetech](https://incompetech.com/music/) - Royalty-free music
