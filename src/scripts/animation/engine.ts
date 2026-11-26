import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

/** Shared acceleration and settling: every control belongs to the same system. */
export const travelEase = CustomEase.create("mote-travel", "0.22,0.8,0.2,1");
export const settleEase = CustomEase.create("mote-settle", "0.22,0.85,0.3,1");
export const pressEase = "power3.out";
export { gsap };
