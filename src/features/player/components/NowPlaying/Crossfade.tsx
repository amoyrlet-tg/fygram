import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEco } from "@/app/ecoMode";

type Layer = { key: string; render: () => ReactNode };

export function Crossfade({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: () => ReactNode;
}) {
  const eco = useEco();
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: id, render: children }]);
  const latest = useRef(children);
  latest.current = children;

  useEffect(() => {
    setLayers((previous) => {
      const top = previous[previous.length - 1];
      if (top?.key === id) return previous;
      const next = { key: id, render: latest.current };
      return eco ? [next] : [...previous.slice(-1), next];
    });
  }, [id, eco]);

  return (
    <>
      {layers.map((layer, index) => {
        const incoming = index === layers.length - 1 && layers.length > 1;
        return (
          <div
            key={layer.key}
            className={`${className}${incoming ? " is-entering" : ""}`}
            onAnimationEnd={() => {
              if (incoming) setLayers([layer]);
            }}
          >
            {layer.render()}
          </div>
        );
      })}
    </>
  );
}
