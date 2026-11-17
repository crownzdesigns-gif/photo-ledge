export interface Photo {
  id: string;
  src: string;
  caption: string;
  /** Card background (the polaroid mat) */
  bg: string;
  /** Caption text colour */
  text: string;
  /** Resting rotation, degrees */
  rotation: number;
  /** Centre position on the 1440×760 landscape (wide) design board */
  cx: number;
  cy: number;
  /** Centre position on the 400×1160 portrait (compact) design board */
  mcx: number;
  mcy: number;
}

/**
 * Positions are the centre points of each card, derived from the Figma
 * bounding boxes (left + w/2, top + h/2) on the 1440×693 hero board.
 */
export const PHOTOS: Photo[] = [
  {
    id: "truck-central",
    src: "/photos/truck-central.png",
    caption: "Truck central Abuja",
    bg: "#c9feac",
    text: "#352e00",
    rotation: 4.72,
    cx: 327,
    cy: 230,
    mcx: 130,
    mcy: 170,
  },
  {
    id: "fine-boy-peach",
    src: "/photos/fine-boy-peach.png",
    caption: "Fine boy launch",
    bg: "#ffe2dc",
    text: "#5b1202",
    rotation: 34.04,
    cx: 856,
    cy: 265,
    mcx: 135,
    mcy: 370,
  },
  {
    id: "watching-man-play",
    src: "/photos/watching-man-play.png",
    caption: "Watching my man play",
    bg: "#febbac",
    text: "#5b1202",
    rotation: -1.99,
    cx: 1114,
    cy: 337,
    mcx: 285,
    mcy: 470,
  },
  {
    id: "arabian-tea",
    src: "/photos/arabian-tea.png",
    caption: "Arabian Tea Memory",
    bg: "#fafafa",
    text: "#002b35",
    rotation: -12.48,
    cx: 664,
    cy: 432,
    mcx: 280,
    mcy: 270,
  },
  {
    id: "vacation",
    src: "/photos/vacation.png",
    caption: "Vacation",
    bg: "#fef2ac",
    text: "#352e00",
    rotation: -13.7,
    cx: 175,
    cy: 539,
    mcx: 135,
    mcy: 755,
  },
  {
    id: "pilot-me",
    src: "/photos/pilot-me.png",
    caption: "Pilot me",
    bg: "#eeacfe",
    text: "#740091",
    rotation: 14.45,
    cx: 443,
    cy: 530,
    mcx: 125,
    mcy: 565,
  },
  {
    id: "star-girl",
    src: "/photos/star-girl.png",
    caption: "Star Girl Biba",
    bg: "#9addff",
    text: "#002b35",
    rotation: 15.47,
    cx: 875,
    cy: 553,
    mcx: 285,
    mcy: 660,
  },
  {
    id: "fine-boy-purple",
    src: "/photos/fine-boy-purple.png",
    caption: "Fine boy launch",
    bg: "#a795ff",
    text: "#10005d",
    rotation: -18.07,
    cx: 1272,
    cy: 550,
    mcx: 260,
    mcy: 845,
  },
];

/** Native design dimensions of the board.
 * Height is a touch taller than the original Figma hero (693) so the lowest
 * cards — which extend further once rotated / two-line captioned — rest fully
 * on the board at their original positions instead of overhanging the edge. */
export const BOARD_W = 1440;
export const BOARD_H = 760;

/** Native dimensions of the portrait (compact) board used on narrow screens.
 * The landscape board can't simply scale down — at phone width the cards would
 * shrink to ~55px and become un-tappable. Instead, below COMPACT_MAX the cards
 * keep their native size and re-flow into this taller, narrower board (mirrors
 * the Figma mobile frame). */
export const BOARD_W_MOBILE = 400;
export const BOARD_H_MOBILE = 940;
