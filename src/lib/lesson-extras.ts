// 🎬 Video extras around the chalk board (docs/LESSONS.md § Video extras, 13 Oct 2026).
// The maths stays on the board; these short clips sit AROUND it: an intro that plays
// before the first scene (a real-life opener, then the tutor's hello) and a cheer
// after a correct quick check. Only the lessons listed here have any — every other
// script plays exactly as before. Shown only while lessonVideoExtrasVisible() is true.

export interface LessonIntroClip {
  src: string;
  /** A still for the poster while the clip loads or waits for a tap. */
  poster?: string;
  /** Width / height, so the frame keeps its shape before the clip loads. */
  aspect: number;
}

export interface LessonExtras {
  intro: LessonIntroClip[];
  /** Plays over the board after a correct quick check. */
  cheer?: string;
}

const EXTRAS: Record<string, LessonExtras> = {
  'quadratic-functions-am': {
    intro: [
      { src: '/lessons/quadratic-functions-am/opener-ball-throw.mp4', poster: '/lessons/quadratic-functions-am/opener-ball-throw.jpg', aspect: 9 / 16 },
      { src: '/lessons/characters/tutor/clips/hello.mp4', poster: '/lessons/characters/tutor/clips/hello.jpg', aspect: 1 },
    ],
    cheer: '/lessons/characters/tutor/clips/cheer.mp4',
  },
};

export function lessonExtras(slug: string): LessonExtras | null {
  return EXTRAS[slug] ?? null;
}
