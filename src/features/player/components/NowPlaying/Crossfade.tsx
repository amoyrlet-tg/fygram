import { useEffect, useRef, useState, type ReactNode } from "react";

type Layer = { key: string; render: () => ReactNode };

/**
 * Keeps the outgoing picture on screen while the new one fades in over it -
 * swapping in place would blink. At most two layers at a time.
 */
export function Crossfade({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: () => ReactNode;
}) {
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: id, render: children }]);
  const latest = useRef(children);
  latest.current = children;

  useEffect(() => {
    setLayers((previous) => {
      const top = previous[previous.length - 1];
      if (top?.key === id) return previous;
      return [...previous.slice(-1), { key: id, render: latest.current }];
    });
  }, [id]);

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
