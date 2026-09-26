import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NameEffect = "steel" | "pulse" | "prism" | "ember";
export type AvatarStyle = "h" | "bolt" | "ghost" | "crown";
export type BannerStyle = "forged" | "graphite" | "aurora" | "carbon";

type ProfileState = {
  username: string;
  handle: string;
  bio: string;
  nameEffect: NameEffect;
  avatar: AvatarStyle;
  banner: BannerStyle;
  badges: string[];
  level: number;
  xp: number;
  updateProfile: (patch: Partial<Omit<ProfileState, "updateProfile">>) => void;
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      username: "zero2hero",
      handle: "0xHYZR",
      bio: "Multi-asset perpetual trader",
      nameEffect: "steel",
      avatar: "bolt",
      banner: "forged",
      badges: ["Founding Trader", "Risk Taker", "12 Day Streak"],
      level: 17,
      xp: 7240,
      updateProfile: (patch) => set(patch),
    }),
    {
      name: "hyzr-profile",
      skipHydration: true,
      partialize: ({ updateProfile: _update, ...profile }) => profile,
    },
  ),
);
