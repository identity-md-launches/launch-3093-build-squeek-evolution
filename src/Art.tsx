import type { Action, Mode } from "./game";
export function Hamster({
  appearance = "classic",
  mode = "idle",
  className = "",
}: {
  appearance?: string;
  mode?: Mode;
  className?: string;
}) {
  const body =
    appearance === "cosmic"
      ? "#aaa0dc"
      : appearance === "cream"
        ? "#e9d2a6"
        : "#dca46e";
  const shade = appearance === "cosmic" ? "#71659e" : "#b7784f";
  return (
    <svg
      className={`hamster-art ${className}`}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${appearance} pixel hamster`}
      shapeRendering="crispEdges"
    >
      <ellipse cx="20" cy="36" rx="13" ry="2" fill="#554528" opacity=".14" />
      <g className={`sprite sprite-${mode}`}>
        {appearance === "cosmic" && (
          <g fill="#e0b54b">
            <path d="M10 5h4v3h4V4h4v4h4V5h4v8H10z" />
            <path d="M6 18h2v2H6zm27-6h2v2h-2zm-1 16h2v2h-2z" />
          </g>
        )}
        <path
          d="M9 10h7v3h8v-3h7v3h3v9h2v10h-3v3H7v-3H4V22h2v-9h3z"
          fill={shade}
        />
        <path
          d="M10 11h5v6h10v-6h5v3h3v10h2v6h-4v4H9v-4H5v-6h2V14h3z"
          fill={body}
        />
        <path d="M10 13h4v4h-4zm16 0h4v4h-4z" fill="#e6a29b" />
        <path d="M16 14h8v3h4v4h2v9h-4v4H14v-4h-4v-9h2v-4h4z" fill="#fff1d9" />
        {mode === "sleeping" ? (
          <path d="M10 22h6v2h-6zm14 0h6v2h-6z" fill="#493b31" />
        ) : (
          <g fill="#493b31">
            <path d="M11 21h4v5h-4zm14 0h4v5h-4z" />
            <path d="M12 21h1v1h-1zm14 0h1v1h-1z" fill="#fff7e9" />
          </g>
        )}
        <path d="M8 26h5v3H8zm19 0h5v3h-5z" fill="#efb1a0" />
        <path d="M18 25h4v3h-4z" fill="#ab7062" />
        <path d="M19 28h2v2h-2zm-2 1h2v1h-2zm4 0h2v1h-2z" fill="#715044" />
        <path d="M7 33h7v3H7zm19 0h7v3h-7z" fill="#b7784f" />
        {mode === "eating" && (
          <g>
            <path d="M15 29h10v5H15z" fill="#e6bd57" />
            <path d="M18 28h2v7h-2z" fill="#b98c32" />
            <path d="M12 30h5v3h-5zm11 0h5v3h-5z" fill={body} />
          </g>
        )}
      </g>
    </svg>
  );
}
export function SeedIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 17C3 10 10 3 18 3c2 8-1 17-7 17-2 0-4-1-5-3Z"
        fill="#d5a34e"
      />
      <path d="M7 18 16 6" stroke="#79552f" strokeWidth="2" />
      <path d="m10 15 1-5m2 2 4-1" stroke="#f7dfa6" strokeWidth="2" />
    </svg>
  );
}
export function Room({
  name,
  mode,
  appearance,
  onAction,
  night,
  festival,
  paused,
}: {
  name: string;
  mode: Mode;
  appearance: string;
  onAction: (a: Action) => void;
  night: boolean;
  festival: boolean;
  paused: boolean;
}) {
  return (
    <div className={`room ${night ? "night" : ""} ${paused ? "paused" : ""}`}>
      <svg
        className="room-scene"
        viewBox="0 0 640 356"
        role="img"
        aria-label={`${name}’s cozy pixel room with a sunny window, bed, plant and exercise wheel`}
        shapeRendering="crispEdges"
      >
        <defs>
          <pattern
            id="wall"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <rect width="40" height="40" fill="#eee9cc" />
            <path d="M2 0v40" stroke="#e7e2c3" strokeWidth="2" />
            <rect x="19" y="19" width="2" height="2" fill="#e4dfbf" />
          </pattern>
          <pattern
            id="floor"
            width="128"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <rect width="128" height="48" fill="#cda67a" />
            <path
              d="M0 0h128M0 24h128M64 0v24M0 24v24"
              stroke="#b68c64"
              strokeWidth="2"
            />
            <path
              d="M8 8h30m42 25h32m-60 8h34"
              stroke="#c2996d"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect width="640" height="246" fill="url(#wall)" />
        <rect y="246" width="640" height="110" fill="url(#floor)" />
        <path d="M0 242h640v7H0z" fill="#b38c64" />
        <path d="M0 239h640v3H0z" fill="#f7f0d3" />
        <path d="M75 48h150v137H75z" fill="#aa8864" />
        <path d="M81 54h138v125H81z" fill="#f9f3da" />
        <path d="M87 60h126v111H87z" fill={night ? "#606e88" : "#bad9cf"} />
        <path
          d="M93 144h35v-12h29v9h34v-16h22v46H87z"
          fill={night ? "#4d6d70" : "#88af89"}
        />
        <path d="M87 158h28v-8h35v12h35v-9h28v18H87z" fill="#638b70" />
        <path
          d="M170 77h16v-6h10v6h8v13h-8v6h-16v-6h-10z"
          fill={night ? "#f7edc1" : "#fff1ae"}
        />
        <path d="M99 90h15v-6h20v6h12v9H99z" fill="#f6f5df" />
        <path d="M150 60v111M87 113h126" stroke="#faf2d9" strokeWidth="6" />
        <path d="M64 47h173v6H64z" fill="#866e53" />
        <path
          d="M68 53h29v84h-7v31H68zm143 0h25v115h-18v-31h-7z"
          fill="#98a881"
        />
        <path d="M74 55h6v106h-6zm151 0h5v105h-5z" fill="#b7c3a0" />
        <path d="M70 165h23v5H70zm147 0h19v5h-19z" fill="#b68b59" />
        <path d="M307 54h73v81h-73z" fill="#b3916b" />
        <path d="M313 60h61v69h-61z" fill="#f6edd3" />
        <path d="M333 80h23v6h7v26h-37V86h7z" fill="#dca46e" />
        <path d="M333 75h6v12h-6zm17 0h6v12h-6z" fill="#b7784f" />
        <path d="M333 94h4v4h-4zm17 0h4v4h-4z" fill="#59432f" />
        <path d="M341 101h5v4h-5z" fill="#f6e9ce" />
        <path d="M446 123h138v9H446z" fill="#b38e67" />
        <path d="M453 132h7v11h-7zm116 0h7v11h-7z" fill="#987958" />
        <path d="M466 84h27v37h-27z" fill="#b1baa0" />
        <path d="M471 84h5v37h-5z" fill="#c8cfb2" />
        <path d="M498 96h16v25h-16z" fill="#d6b887" />
        <path d="M518 88h18v33h-18z" fill="#a6b8bf" />
        <path d="M553 100h25l-4 21h-17z" fill="#c68d6a" />
        <path d="M564 99V68" stroke="#638765" strokeWidth="4" />
        <path
          d="M564 84h-14v-7h-7v-8h14v7h7zm2-6h14v-7h7v-9h-14v8h-7z"
          fill="#77956c"
        />
        <ellipse
          cx="138"
          cy="300"
          rx="72"
          ry="16"
          fill="#a17f5d"
          opacity=".25"
        />
        <path d="M65 260h132v46H65z" fill="#a97e59" />
        <path d="M60 254h142v8H60z" fill="#b78d63" />
        <path d="M71 264h120v29H71z" fill="#e7ddbe" />
        <path d="M78 264h32v24H78z" fill="#f4ecd4" />
        <path d="M116 264h75v29h-75z" fill="#9caa85" />
        <path d="M124 270h60v4h-60zm0 10h60v4h-60z" fill="#b9c2a0" />
        <path d="M65 303h9v12h-9zm123 0h9v12h-9z" fill="#896b4d" />
        <ellipse
          cx="485"
          cy="307"
          rx="76"
          ry="13"
          fill="#a17f5d"
          opacity=".25"
        />
        <path d="M477 248h14v63h-14z" fill="#8b7b66" />
        <path d="M448 308h73v7h-73z" fill="#8b7b66" />
        <path
          d="M454 170h61v6h17v12h11v19h6v39h-6v18h-11v12h-17v6h-61v-6h-17v-12h-11v-18h-6v-39h6v-19h11v-12h17z"
          fill="#7c947f"
        />
        <path
          d="M457 180h55v6h15v11h10v19h5v24h-5v18h-10v10h-15v6h-55v-6h-15v-10h-10v-18h-5v-24h5v-19h10v-11h15z"
          fill="#cfceaa"
        />
        <path
          d="M460 187h49v6h14v10h8v17h5v16h-5v17h-8v9h-14v6h-49v-6h-14v-9h-8v-17h-5v-16h5v-17h8v-10h14z"
          fill="#ddd6b7"
        />
        <g
          className={
            mode === "running" ? "wheel-spokes spinning" : "wheel-spokes"
          }
          style={{ transformOrigin: "484px 227px" }}
          stroke="#a9b699"
          strokeWidth="5"
        >
          <path d="M484 187v80m-49-40h98m-83-32 68 65m0-65-68 65" />
        </g>
        <path d="M479 221h11v12h-11z" fill="#7c947f" />
        <ellipse
          cx="300"
          cy="316"
          rx="90"
          ry="21"
          fill="#b49371"
          opacity=".18"
        />
        <path d="M232 296h124v4h14v20H218v-20h14z" fill="#b1b38c" />
        <path d="M237 301h113v15H237z" fill="#c7c8a6" />
        <path d="M386 286h38v7h-4v15h-30v-15h-4z" fill="#c28665" />
        <path d="M389 286h32v8h-32z" fill="#e4bf86" />
        <path d="M394 285h5v5h-5zm12-2h5v6h-5zm8 3h4v4h-4z" fill="#98754c" />
        <path d="M580 252h23v31h-23z" fill="#9d785a" />
        <path d="M574 247h35v7h-35z" fill="#c6906c" />
        <path d="M590 245v-48" stroke="#638765" strokeWidth="5" />
        <path
          d="M588 225h-16v-8h-9v-13h17v8h8zm5-11h14v-10h8v-15h-15v10h-7z"
          fill="#78946b"
        />
        <path
          d="M39 320h8v3h-8zm176 15h8v3h-8zm354-13h9v3h-9z"
          fill="#e8ce96"
        />
      </svg>
      <button
        className="room-hotspot bed-spot"
        aria-label={night ? "Wake up from the bed" : "Sleep in the bed"}
        onClick={() => onAction("sleep")}
      >
        <span>{night ? "Wake up" : "Take a nap"}</span>
      </button>
      <button
        className="room-hotspot wheel-spot"
        aria-label="Play on the wheel"
        onClick={() => onAction("play")}
      >
        <span>Let’s play</span>
      </button>
      <button
        className="room-hotspot bowl-spot"
        aria-label="Feed from the bowl"
        onClick={() => onAction("feed")}
      >
        <span>Snack time</span>
      </button>
      <button
        className={`pet-spot pet-${mode}`}
        onClick={() => onAction("pet")}
        aria-label={`Pet ${name} in the room`}
      >
        <Hamster mode={mode} appearance={appearance} />
      </button>
      {mode === "sleeping" && (
        <span className="sleep-letter" aria-hidden="true">
          z z z
        </span>
      )}
      {mode === "reaction" && (
        <span className="heart-reaction" aria-hidden="true">
          ♥
        </span>
      )}
      {mode === "cleaning" && (
        <div className="clean-sparkles" aria-hidden="true">
          ✧　✦　✧
        </div>
      )}
      {festival && (
        <div className="festival-pixels" aria-hidden="true">
          ✦　✧　✦　✧　✦
        </div>
      )}
      <span className="room-caption">
        {night ? "Moonlight & sweet dreams" : "A cozy corner of Squeekchain"}
      </span>
    </div>
  );
}
