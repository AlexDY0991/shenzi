// Single source of truth for the edit. Picture, captions and music all read
// their cut points from here, so retiming a shot keeps everything in sync.
//
// 120 BPM: one beat = 0.5 s, one bar = 2 s. Every cut lands on a beat, the
// way the reference film cuts on the music.

export const FPS = 30;
export const DURATION = 30;
export const BPM = 120;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const ORANGE = '#FF5A00';

// whipIn / whipOut: seconds of directional motion blur at the cut.
// flashIn: white flash on the first frames (paired with an impact in the music).
export const SHOTS = [
  { id: 'traffic', start: 0.0, end: 2.0 },
  { id: 'rise', start: 2.0, end: 4.0, whipOut: 0.25 },
  { id: 'urbanReveal', start: 4.0, end: 6.5, flashIn: 0.35, whipIn: 0.2 },
  { id: 'urbanStudio', start: 6.5, end: 9.5 },
  { id: 'ductedFan', start: 9.5, end: 13.0 },
  { id: 'urbanFlight', start: 13.0, end: 15.5, whipOut: 0.25 },
  { id: 'dreamReveal', start: 15.5, end: 18.0, whipIn: 0.25, flashIn: 0.2 },
  { id: 'statFlightTime', start: 18.0, end: 20.0 },
  { id: 'statPayload', start: 20.0, end: 22.0 },
  { id: 'statSpeed', start: 22.0, end: 24.0, whipOut: 0.2 },
  { id: 'skyRoad', start: 24.0, end: 26.5 },
  { id: 'endCard', start: 26.5, end: 30.0, flashIn: 0.3 },
];

// Musical events derived from the edit (seconds).
export const CUES = {
  riserStart: 2.0,
  drop: 4.0,
  breath: 13.0, // drums thin out for the flight shot
  dreamDrop: 15.5,
  statHits: [18.0, 20.0, 22.0],
  finale: 24.0,
  finalHit: 26.5,
  end: DURATION,
  whooshes: [4.0, 15.5, 24.0],
};

export function shotAt(t) {
  for (const s of SHOTS) if (t >= s.start && t < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}
