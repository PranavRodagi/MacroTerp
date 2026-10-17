// React wrapper around the standalone plate component in frontend/plate-visualizer/.
// That folder stays the source of truth; this file only mounts it.
import { useEffect, useRef } from "react";
import "../../../plate-visualizer/food-assets.js"; // sets window.FOOD_ASSETS
import "../../../plate-visualizer/plate-visualizer.js"; // sets window.PlateVisualizer
import "../../../plate-visualizer/plate-visualizer.css";
import type { Meal } from "../lib/types";

type FoodAsset = { src: string };
type PlateHandle = { render(meal: Meal): void; destroy(): void };
declare global {
  interface Window {
    FOOD_ASSETS: Record<string, FoodAsset>;
    PlateVisualizer: { mount(el: HTMLElement, opts?: { assetBase?: string }): PlateHandle };
  }
}

// Let Vite fingerprint the cut-outs, then point each asset entry at its built URL.
const imageUrls = import.meta.glob<string>("../../../plate-visualizer/assets/food/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const urlByFile = Object.fromEntries(Object.entries(imageUrls).map(([path, url]) => [path.split("/").pop(), url]));
for (const asset of Object.values(window.FOOD_ASSETS)) {
  asset.src = urlByFile[asset.src] ?? asset.src;
}

export function PlateView({ meal }: { meal: Meal }) {
  const el = useRef<HTMLDivElement>(null);
  const viz = useRef<PlateHandle | null>(null);

  useEffect(() => {
    viz.current = window.PlateVisualizer.mount(el.current!, { assetBase: "" });
    return () => viz.current?.destroy();
  }, []);

  useEffect(() => {
    viz.current?.render(meal);
  }, [meal]);

  return <div className="plate-view" ref={el} />;
}
