import * as THREE from "three";

// --- Configuration ---
const PADDLE_SENSITIVITY = 120;
const TOUCH_SENSITIVITY = 0.5;
const PADDLE_LERP_FACTOR = 15;
const TUBE_WIDTH = 120;
const TUBE_HEIGHT = 80;
const TUBE_DEPTH = 300;

// --- Time Dilation Configuration ---
const TIME_DILATION_ZONE_DEPTH = 110; // How close the ball needs to be to the paddle to slow down
const TIME_DILATION_FACTOR = 0.4; // How much the ball slows down (0.4 = 40% of normal speed)
const TIME_DILATION_BOOST = 1.1; // Speed boost after hitting the paddle to compensate for slowdown

const BLOCK_GRID_X = 10;
const BLOCK_GRID_Y = 8;
const BLOCK_GRID_Z = 4;


const SPIN_FACTOR = 0.08; // How much paddle velocity translates to spin
const MAX_SPIN = 50; // Maximum spin magnitude
const MAGNUS_COEFFICIENT = 0.0007; // Strength of the curve effect
const SPIN_BOUNCE_EFFECT = 0.1; // How much spin affects wall rebounds
const SPIN_DECAY = 0.1; // How quickly spin wears off over time
const SPIN_POWER_THRESHOLD = MAX_SPIN * 0.5; // Spin needed to activate power mode
const POWER_COLOR = 0xff6600; // Fiery orange color for power mode
const SPIN_DAMPEN_ON_COLLISION = 0.95; // Percentage of spin retained after a non-paddle collision
const VISUAL_SPIN_MULTIPLIER = 0.03; // How fast the ball mesh rotates visually


const BLOCK_SIZE = new THREE.Vector3(
  TUBE_WIDTH / BLOCK_GRID_X,
  TUBE_HEIGHT / BLOCK_GRID_Y,
  15,
);
const BALL_RADIUS = 4;
const PADDLE_SIZE = new THREE.Vector3(20, 20, 1);
const BALL_INITIAL_SPEED = 150;
const SPECIAL_BLOCK_CHANCE = 0.2;
const POWERUP_DURATION = 10;
const GUARANTEED_UNBREAKABLE_PER_LAYER = 3;

// --- Game State ---

let scene, camera, renderer, clock;
let paddleTargetPosition = new THREE.Vector2();
let paddleLastPosition = new THREE.Vector3(); // Add this line
let balls = [],
  blocks = [],
  particles = [],
  powerUps = [];
let paddle, timerBar;
let score = 0;
let highScore = localStorage.getItem("totxoHighScore") || 0;
let isGameActive = false;
let breakableBlocksLeft = 0;
let screenShake = { intensity: 0, duration: 0, timer: 0 };
let paddleEffect = { shineTimer: 0, wobbleTimer: 0 };
const PADDLE_EFFECT_DURATION = 0.4;
let powerUpState = { widePaddleTimer: 0, shrinkPaddleTimer: 0 };
let highlighters = [];
// --- NEW: Variables for relative touch controls ---
let touchStartX = 0,
  touchStartY = 0,
  isPointerDown = false,
  paddleInitialX = 0,
  paddleInitialY = 0;


// --- DOM Elements ---
let infoElement = document.getElementById("info");
let scoreElement = document.getElementById("score");
let blocksLeftElement = document.getElementById("blocks-left");
const startModal = document.getElementById("startModal");
const playButton = document.getElementById("playButton");
const gameOverElement = document.getElementById("gameover");
const gameOverTitle = document.getElementById("gameOverTitle");
const finalScoreElement = document.getElementById("finalScore");
const restartButton = document.getElementById("restartButton");

function init() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.set(0, 0, TUBE_DEPTH / 2 + 60);
  camera.lookAt(0, 0, 0);

  if (aspect < 1) {
    camera.fov = 90;
    camera.updateProjectionMatrix();
  }

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xcccccc, 0x444444, 1.2));
  const pointLight = new THREE.PointLight(0xffffff, 1.5, 1000);
  pointLight.position.set(0, 20, TUBE_DEPTH / 2 + 30);
  pointLight.castShadow = true;
  scene.add(pointLight);

  createWorld();
  addEventListeners();
  animate();
}

function createWorld() {
  const gridGroup = new THREE.Group();
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
		emissive: 0x00ffff,
    emissiveIntensity: 0.5,
  });

  for (let i = 0; i <= 10; i++) {
    const z = -TUBE_DEPTH / 2 + (i / 10) * TUBE_DEPTH;
    const points = [
      new THREE.Vector3(-TUBE_WIDTH / 2, -TUBE_HEIGHT / 2, z),
      new THREE.Vector3(TUBE_WIDTH / 2, -TUBE_HEIGHT / 2, z),
      new THREE.Vector3(TUBE_WIDTH / 2, -TUBE_HEIGHT / 2, z),
      new THREE.Vector3(TUBE_WIDTH / 2, TUBE_HEIGHT / 2, z),
      new THREE.Vector3(TUBE_WIDTH / 2, TUBE_HEIGHT / 2, z),
      new THREE.Vector3(-TUBE_WIDTH / 2, TUBE_HEIGHT / 2, z),
      new THREE.Vector3(-TUBE_WIDTH / 2, TUBE_HEIGHT / 2, z),
      new THREE.Vector3(-TUBE_WIDTH / 2, -TUBE_HEIGHT / 2, z),
    ];
    gridGroup.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        gridMaterial,
      ),
    );
  }

  for (let i = 0; i <= BLOCK_GRID_X; i++) {
    const x = -TUBE_WIDTH / 2 + i * BLOCK_SIZE.x;
    const points = [
      new THREE.Vector3(x, -TUBE_HEIGHT / 2, -TUBE_DEPTH / 2),
      new THREE.Vector3(x, -TUBE_HEIGHT / 2, TUBE_DEPTH / 2),
      new THREE.Vector3(x, TUBE_HEIGHT / 2, -TUBE_DEPTH / 2),
      new THREE.Vector3(x, TUBE_HEIGHT / 2, TUBE_DEPTH / 2),
    ];
    gridGroup.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        gridMaterial,
      ),
    );
  }

  for (let i = 0; i <= BLOCK_GRID_Y; i++) {
    const y = -TUBE_HEIGHT / 2 + i * BLOCK_SIZE.y;
    const points = [
      new THREE.Vector3(-TUBE_WIDTH / 2, y, -TUBE_DEPTH / 2),
      new THREE.Vector3(-TUBE_WIDTH / 2, y, TUBE_DEPTH / 2),
      new THREE.Vector3(TUBE_WIDTH / 2, y, -TUBE_DEPTH / 2),
      new THREE.Vector3(TUBE_WIDTH / 2, y, TUBE_DEPTH / 2),
    ];
    gridGroup.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        gridMaterial,
      ),
    );
  }

  scene.add(gridGroup);

  const paddleRadius = 4;
  const paddleShape = createRoundedRectShape(
    PADDLE_SIZE.x,
    PADDLE_SIZE.y,
    paddleRadius,
  );
  const extrudeSettings = {
    steps: 1,
    depth: PADDLE_SIZE.z,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 1,
    bevelOffset: -1,
    bevelSegments: 8,
  };
  const paddleGeometry = new THREE.ExtrudeGeometry(
    paddleShape,
    extrudeSettings,
  );
  paddleGeometry.center();

  const paddleMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d9efd,
    metalness: 0.6,
    roughness: 0.2,
    transparent: true,
    opacity: 0.75,
  });
  paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
  paddle.position.z = TUBE_DEPTH / 2 - 10;
  paddle.castShadow = true;
  paddle.userData.velocity = new THREE.Vector3();
  scene.add(paddle);

  const timerBarGeo = new THREE.BoxGeometry(
    PADDLE_SIZE.x,
    2,
    PADDLE_SIZE.z + 0.1,
  );
  const timerBarMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  timerBar = new THREE.Mesh(timerBarGeo, timerBarMat);
  timerBar.position.y = PADDLE_SIZE.y / 2 + 2;
  timerBar.visible = false;
  paddle.add(timerBar);

  createHighlighters();
}

function createHighlighters() {
  highlighters = [];
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08,
  });
  material.depthWrite = false;

  const highlightDepth = BALL_RADIUS * 3;

  const horizGeo = new THREE.PlaneGeometry(TUBE_WIDTH, highlightDepth);
  const topPlane = new THREE.Mesh(horizGeo, material);
  topPlane.position.y = TUBE_HEIGHT / 2;
  topPlane.rotation.x = -Math.PI / 2;
  highlighters.push(topPlane);
  scene.add(topPlane);

  const bottomPlane = new THREE.Mesh(horizGeo.clone(), material);
  bottomPlane.position.y = -TUBE_HEIGHT / 2;
  bottomPlane.rotation.x = Math.PI / 2;
  highlighters.push(bottomPlane);
  scene.add(bottomPlane);

  const vertGeo = new THREE.PlaneGeometry(highlightDepth, TUBE_HEIGHT);
  const leftPlane = new THREE.Mesh(vertGeo, material);
  leftPlane.position.x = -TUBE_WIDTH / 2;
  leftPlane.rotation.y = Math.PI / 2;
  highlighters.push(leftPlane);
  scene.add(leftPlane);

  const rightPlane = new THREE.Mesh(vertGeo.clone(), material);
  rightPlane.position.x = TUBE_WIDTH / 2;
  rightPlane.rotation.y = -Math.PI / 2;
  highlighters.push(rightPlane);
  scene.add(rightPlane);
}

function createBall(position, velocity) {
  const ballMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccc00,
    roughness: 0.5,
		emissive: 0xcccc00,
    emissiveIntensity: 0.5,
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 32),
    ballMaterial,
  );
  ball.castShadow = true;
  ball.position.copy(position);
  ball.userData.velocity = velocity;
  ball.userData.spin = new THREE.Vector3(0, 0, 0);

  // --- Add Spin Helper ---
  const helperGeo = new THREE.TorusGeometry(BALL_RADIUS * 1.2, 1, 3, 24);
  const helperMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: false,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const spinHelper = new THREE.Mesh(helperGeo, helperMat);
  ball.userData.spinHelper = spinHelper; // Store reference to helper
  ball.add(spinHelper); // Attach helper as a child of the ball

  balls.push(ball);
  scene.add(ball);
}

function createBlocks() {
  blocks.forEach((block) => scene.remove(block));
  blocks = [];
  breakableBlocksLeft = 0; // Reset counter correctly

  const blockGeo = new THREE.BoxGeometry(
    BLOCK_SIZE.x * 0.9,
    BLOCK_SIZE.y * 0.9,
    BLOCK_SIZE.z * 0.9,
  );

  for (let z = 0; z < BLOCK_GRID_Z; z++) {
    // --- Pre-select unbreakable block positions for this layer ---
    const unbreakablePositions = new Set();
    // This logic now correctly applies ONLY to the layers that can have unbreakables
    if (true) {
      const totalPositions = BLOCK_GRID_X * BLOCK_GRID_Y;
      const allPositions = Array.from(Array(totalPositions).keys());

      // Shuffle the positions array
      for (let i = allPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
      }

      // Take the first N positions for our unbreakable blocks
      for (let i = 0; i < GUARANTEED_UNBREAKABLE_PER_LAYER; i++) {
        unbreakablePositions.add(allPositions[i]);
      }
    }

    for (let y = 0; y < BLOCK_GRID_Y; y++) {
      for (let x = 0; x < BLOCK_GRID_X; x++) {
        const block = new THREE.Mesh(blockGeo);
        const blockTypeChance = Math.random();
        const currentIndex = y * BLOCK_GRID_X + x;

        // --- Use the pre-selected positions to create WHITE unbreakables ---
        if (unbreakablePositions.has(currentIndex)) {
          block.material = new THREE.MeshStandardMaterial({
            color: 0xff0000, // White for max visibility
            metalness: 0.1,
            roughness: 0.4,
          });
          block.userData.isUnbreakable = true;
          block.userData.health = 5;
        } else if (blockTypeChance < SPECIAL_BLOCK_CHANCE) {
          block.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xaaaaaa,
            emissiveIntensity: 0.5,
          });
          block.userData.isSpecial = true;
          block.userData.health = 1;
          const rand = Math.random();
          if (rand < 0.33) block.userData.powerUpType = "widePaddle";
          else if (rand < 0.66) block.userData.powerUpType = "multiBall";
          else block.userData.powerUpType = "shrinkPaddle";
        } else if (blockTypeChance < 0.5) {
          block.userData.health = 3;
          block.userData.isArmored = true;
          block.material = new THREE.MeshStandardMaterial({
            color: 0x888899,
            metalness: 0.9,
            roughness: 0.4,
          });
        } else {
          const hue = z / BLOCK_GRID_Z;
          let blockColor = new THREE.Color().setHSL(hue, 0.8, 0.6);
          if (hue === 0) { // Fix for the red/black issue
            blockColor.setHex(0xff4444);
          }
          block.material = new THREE.MeshStandardMaterial({
            color: blockColor,
            metalness: 0.1,
            roughness: 0.5,
          });
          block.userData.health = 1;
        }

        block.position.set(
          (x - (BLOCK_GRID_X - 1) / 2) * BLOCK_SIZE.x,
          (y - (BLOCK_GRID_Y - 1) / 2) * BLOCK_SIZE.y,
          -TUBE_DEPTH / 2 + (z + 1.5) * BLOCK_SIZE.z,
        );
        block.castShadow = true;
        blocks.push(block);
        scene.add(block);

        if (!block.userData.isUnbreakable) {
          breakableBlocksLeft++;
        }
      }
    }
  }
}

function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2,
    y = -height / 2;
  shape.moveTo(x, y + radius);
  shape.lineTo(x, y + height - radius);
  shape.quadraticCurveTo(x, y + height, x + radius, y + height);
  shape.lineTo(x + width - radius, y + height);
  shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
  shape.lineTo(x + width, y + radius);
  shape.quadraticCurveTo(x + width, y, x + width - radius, y);
  shape.lineTo(x + radius, y);
  shape.quadraticCurveTo(x, y, x, y + radius);
  return shape;
}

function resetGame() {
  startModal.style.display = "none";
  gameOverElement.style.display = "none";
  infoElement.style.display = "block";

  paddle.position.set(0, 0, TUBE_DEPTH / 2 - 5);
  paddleTargetPosition.set(0, 0);
  isGameActive = true;
  score = 0;

  infoElement.innerHTML = `Score: <span id="score">0</span> | Blocks: <span id="blocks-left">0</span> | High Score: <span id="highScore">${highScore}</span>`;
  scoreElement = document.getElementById("score");
  blocksLeftElement = document.getElementById("blocks-left");

  balls.forEach((b) => scene.remove(b));
  balls = [];
  powerUps.forEach((p) => scene.remove(p));
  powerUps = [];
  powerUpState.widePaddleTimer = 0;
  powerUpState.shrinkPaddleTimer = 0;
  paddle.scale.x = 1;

  createBlocks();
  blocksLeftElement.textContent = breakableBlocksLeft;

  const initialPos = new THREE.Vector3(
    0,
    0,
    paddle.position.z - PADDLE_SIZE.z / 2 - BALL_RADIUS - 1,
  );
  const initialAngleX = (Math.random() - 0.5) * 0.5;
  const initialAngleY = (Math.random() - 0.5) * 0.5;
  const initialVel = new THREE.Vector3(initialAngleX, initialAngleY, -1)
    .normalize()
    .multiplyScalar(BALL_INITIAL_SPEED);
  createBall(initialPos, initialVel);
}

function createPowerUp(position, type) {
  let color;
  if (type === "widePaddle") color = 0x00ff00;
  else if (type === "multiBall") color = 0xcc00ff;
  else if (type === "shrinkPaddle") color = 0xff0000;

  const powerUpGeo = new THREE.BoxGeometry(5, 5, 5);
  const powerUpMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
  });
  const powerUp = new THREE.Mesh(powerUpGeo, powerUpMat);
  powerUp.position.copy(position);
  powerUp.userData.type = type;
  powerUp.userData.velocity = new THREE.Vector3(0, 0, 50);

  powerUps.push(powerUp);
  scene.add(powerUp);
}

function activatePowerUp(type) {
  if (type === "widePaddle") {
    powerUpState.widePaddleTimer = POWERUP_DURATION;
    powerUpState.shrinkPaddleTimer = 0;
    paddle.scale.x = 1.5;
  } else if (type === "shrinkPaddle") {
    powerUpState.shrinkPaddleTimer = POWERUP_DURATION;
    powerUpState.widePaddleTimer = 0;
    paddle.scale.x = 0.5;
  } else if (type === "multiBall" && balls.length > 0) {
    const originalBall = balls[0];
    const pos = originalBall.position.clone();
    const vel = originalBall.userData.velocity.clone();
    createBall(
      pos,
      vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3),
    );
    createBall(
      pos,
      vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.3),
    );
  }
}

function createExplosion(position, color) {
  const particleCount = 20;
  const particleGeo = new THREE.BufferGeometry();
  const positions = [];
  const material = new THREE.PointsMaterial({
    color,
    size: 1.5,
    blending: THREE.AdditiveBlending,
    transparent: true,
    sizeAttenuation: true,
  });

  for (let i = 0; i < particleCount; i++)
    positions.push(position.x, position.y, position.z);
  particleGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  const particleSystem = new THREE.Points(particleGeo, material);
  particleSystem.userData = { velocities: [], life: 1.0 };

  for (let i = 0; i < particleCount; i++) {
    particleSystem.userData.velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
      ),
    );
  }
  particles.push(particleSystem);
  scene.add(particleSystem);
}

function triggerScreenShake(intensity, duration) {
  screenShake.intensity = intensity;
  screenShake.duration = duration;
  screenShake.timer = 0;
}

function handleCollisions() {
  const paddleBox = new THREE.Box3().setFromObject(paddle);

  for (let b = balls.length - 1; b >= 0; b--) {
    const ball = balls[b];
    const ballVelocity = ball.userData.velocity;
    const ballSpin = ball.userData.spin;

    // --- Wall Collisions with Spin ---
    if (Math.abs(ball.position.x) > TUBE_WIDTH / 2 - BALL_RADIUS) {
      ballVelocity.x *= -1;
      ballVelocity.y += ballSpin.z * SPIN_BOUNCE_EFFECT;
      ballVelocity.z -= ballSpin.y * SPIN_BOUNCE_EFFECT;
      ball.position.x =
        (TUBE_WIDTH / 2 - BALL_RADIUS) * Math.sign(ball.position.x);
      ballSpin.multiplyScalar(SPIN_DAMPEN_ON_COLLISION); // Dampen spin
    }
    if (Math.abs(ball.position.y) > TUBE_HEIGHT / 2 - BALL_RADIUS) {
      ballVelocity.y *= -1;
      ballVelocity.x -= ballSpin.z * SPIN_BOUNCE_EFFECT;
      ballVelocity.z += ballSpin.x * SPIN_BOUNCE_EFFECT;
      ball.position.y =
        (TUBE_HEIGHT / 2 - BALL_RADIUS) * Math.sign(ball.position.y);
      ballSpin.multiplyScalar(SPIN_DAMPEN_ON_COLLISION); // Dampen spin
    }
    if (ball.position.z < -TUBE_DEPTH / 2 + BALL_RADIUS) {
      ballVelocity.z *= -1;
      ballVelocity.x += ballSpin.y * SPIN_BOUNCE_EFFECT;
      ballVelocity.y -= ballSpin.x * SPIN_BOUNCE_EFFECT;
      ballSpin.multiplyScalar(SPIN_DAMPEN_ON_COLLISION); // Dampen spin
    }

    const ballBox = new THREE.Box3().setFromObject(ball);
    if (ballVelocity.z > 0 && ballBox.intersectsBox(paddleBox)) {
      triggerScreenShake(0.5, 0.2);
      paddleEffect.shineTimer = PADDLE_EFFECT_DURATION;
      paddleEffect.wobbleTimer = PADDLE_EFFECT_DURATION;
      // --- MODIFIED: Apply speed boost on paddle hit ---
      ballVelocity.z *= -1.02 * TIME_DILATION_BOOST;

      // --- Impart Spin from Paddle ---
      const spinInfluence = paddle.userData.velocity.clone();
      spinInfluence.z = 0; // Only use X and Y paddle movement for spin
      ball.userData.spin
        .add(spinInfluence.multiplyScalar(SPIN_FACTOR))
        .clampLength(0, MAX_SPIN);

      const hitPointX = ball.position.x - paddle.position.x;
      const hitPointY = ball.position.y - paddle.position.y;
      ballVelocity.x += hitPointX * 0.1;
      ballVelocity.y += hitPointY * 0.1;

      ballVelocity.normalize().multiplyScalar(BALL_INITIAL_SPEED);
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const blockBox = new THREE.Box3().setFromObject(block);
      if (ballBox.intersectsBox(blockBox)) {
        // --- MODIFIED: Bug fix for ball passing through blocks ---

        // 1. A bounce should always happen on collision.
        const ballCenter = ball.position.clone();
        const blockCenter = block.position.clone();
        const delta = ballCenter.sub(blockCenter);
        const halfSize = new THREE.Vector3(
          BLOCK_SIZE.x / 2,
          BLOCK_SIZE.y / 2,
          BLOCK_SIZE.z / 2,
        );
        const dx = Math.abs(delta.x) / halfSize.x;
        const dy = Math.abs(delta.y) / halfSize.y;
        const dz = Math.abs(delta.z) / halfSize.z;

        if (dx > dy && dx > dz) {
          ballVelocity.x *= -1;
          ballVelocity.y += ballSpin.z * SPIN_BOUNCE_EFFECT;
          ballVelocity.z -= ballSpin.y * SPIN_BOUNCE_EFFECT;
        } else if (dy > dx && dy > dz) {
          ballVelocity.y *= -1;
          ballVelocity.x -= ballSpin.z * SPIN_BOUNCE_EFFECT;
          ballVelocity.z += ballSpin.x * SPIN_BOUNCE_EFFECT;
        } else {
          ballVelocity.z *= -1;
          ballVelocity.x += ballSpin.y * SPIN_BOUNCE_EFFECT;
          ballVelocity.y -= ballSpin.x * SPIN_BOUNCE_EFFECT;
        }
        ballSpin.multiplyScalar(SPIN_DAMPEN_ON_COLLISION);

        // 2. Then, handle the block's health and destruction.
        let blockDestroyed = false;
        if (block.userData.isUnbreakable && !ball.userData.isPowered) {
          // Unbreakable block hit by normal ball, just bounce. Do nothing else.
        } else {
          block.userData.health--;

          if (block.userData.isUnbreakable) {
            const healthPercentage = block.userData.health / 5;
            block.material.color
              .setHex(0xff0000)
              .lerp(new THREE.Color(POWER_COLOR), 1 - healthPercentage);
            score += 5;
          }

          if (block.userData.health <= 0) {
            blockDestroyed = true; // Mark block for destruction
            if (block.userData.isSpecial) {
              createPowerUp(block.position.clone(), block.userData.powerUpType);
            }
            createExplosion(block.position.clone(), block.material.color);
            scene.remove(block);
            blocks.splice(i, 1);
            score += block.userData.isUnbreakable ? 50 : 10;
            if (!block.userData.isUnbreakable) {
              breakableBlocksLeft--;
            }
          } else if (block.userData.isArmored) {
            const healthPercentage = block.userData.health / 3;
            block.material.color
              .setHex(0x888899)
              .lerp(new THREE.Color(0xff4444), 1 - healthPercentage);
            score += 2;
          }
        }

        scoreElement.textContent = score;
        blocksLeftElement.textContent = breakableBlocksLeft;

        // 3. Only stop checking for more collisions if the block was NOT destroyed.
        if (!blockDestroyed) {
          break;
        }
        // If the block was destroyed, we continue the loop to allow the ball
        // to hit another block right behind it in the same frame.
      }
    }
  }

  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    const powerUpBox = new THREE.Box3().setFromObject(powerUp);
    if (powerUpBox.intersectsBox(paddleBox)) {
      activatePowerUp(powerUp.userData.type);
      scene.remove(powerUp);
      powerUps.splice(i, 1);
    } else if (powerUp.position.z > TUBE_DEPTH / 2) {
      scene.remove(powerUp);
      powerUps.splice(i, 1);
    }
  }

  const gameOver =
    (balls.length === 0 || breakableBlocksLeft <= 0) && isGameActive;
  if (gameOver) {
    isGameActive = false;
    infoElement.style.display = "none";

    if (score > highScore) {
      highScore = score;
      localStorage.setItem("totxoHighScore", highScore);
      gameOverTitle.textContent = "New High Score!";
    } else {
      gameOverTitle.textContent =
        breakableBlocksLeft <= 0 ? "You Win!" : "Game Over";
    }

    finalScoreElement.textContent = score;
    gameOverElement.style.display = "block";
  }
}

function addEventListeners() {
  window.addEventListener("resize", () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    if (aspect < 1) {
      camera.fov = 90;
    } else {
      camera.fov = 75;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener("mousemove", (event) => {
    if (!isPointerDown) {
      // Allow mouse to work when touch is not active
      movePaddle(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
        false,
      );
    }
  });

  // --- MODIFIED: Touch event listeners for relative movement ---
  window.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length > 0) {
        isPointerDown = true;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        paddleInitialX = paddleTargetPosition.x;
        paddleInitialY = paddleTargetPosition.y;
      }
    },
    { passive: false },
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault(); // Prevent scrolling
      if (event.touches.length > 0 && isPointerDown) {
        const currentX = event.touches[0].clientX;
        const currentY = event.touches[0].clientY;

        const deltaX = (currentX - touchStartX) * TOUCH_SENSITIVITY;
        const deltaY = -(currentY - touchStartY) * TOUCH_SENSITIVITY; // Y is inverted

        movePaddle(paddleInitialX + deltaX, paddleInitialY + deltaY, true);
      }
    },
    { passive: false },
  );

  window.addEventListener("touchend", () => {
    isPointerDown = false;
  });

  playButton.addEventListener("click", resetGame);
  restartButton.addEventListener("click", resetGame);
}

function movePaddle(targetX, targetY, isTouch) {
  if (!isGameActive) return;

  const sensitivity = isTouch ? 1 : PADDLE_SENSITIVITY;

  const finalTargetX = isTouch ? targetX : targetX * sensitivity;
  const finalTargetY = isTouch ? targetY : targetY * sensitivity;


  const paddleRadius = 4;
  const paddleLimitX = TUBE_WIDTH / 2 - (PADDLE_SIZE.x * 1) / 2 + paddleRadius;
  const paddleLimitY = TUBE_HEIGHT / 2 - PADDLE_SIZE.y / 2 + paddleRadius;

  paddleTargetPosition.x = THREE.MathUtils.clamp(
    finalTargetX,
    -paddleLimitX,
    paddleLimitX,
  );
  paddleTargetPosition.y = THREE.MathUtils.clamp(
    finalTargetY,
    -paddleLimitY,
    paddleLimitY,
  );
}


function updatePowerUpTimers(delta) {
  let timerIsActive = false;
  let progress = 0;

  if (powerUpState.widePaddleTimer > 0) {
    powerUpState.widePaddleTimer -= delta;
    timerIsActive = true;
    progress = powerUpState.widePaddleTimer / POWERUP_DURATION;
    timerBar.material.color.setHex(0x00ff00);
    if (powerUpState.widePaddleTimer <= 0) {
      paddle.scale.x = 1;
    }
  } else if (powerUpState.shrinkPaddleTimer > 0) {
    powerUpState.shrinkPaddleTimer -= delta;
    timerIsActive = true;
    progress = powerUpState.shrinkPaddleTimer / POWERUP_DURATION;
    timerBar.material.color.setHex(0xff0000);
    if (powerUpState.shrinkPaddleTimer <= 0) {
      paddle.scale.x = 1;
    }
  }

  if (timerIsActive) {
    timerBar.visible = true;
    timerBar.scale.x = Math.max(0, progress);
    timerBar.position.x = (-(1 - Math.max(0, progress)) * PADDLE_SIZE.x) / 2;
  } else {
    timerBar.visible = false;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  const shouldBeVisible = isGameActive && balls.length > 0;
  if (highlighters.length > 0) {
    if (shouldBeVisible) {
      const mainBall = balls[0];
      highlighters.forEach((h) => {
        h.position.z = mainBall.position.z;
        h.visible = true;
      });
    } else {
      highlighters.forEach((h) => {
        h.visible = false;
      });
    }
  }

  if (isGameActive) {
    // Calculate paddle velocity
    paddle.userData.velocity
      .subVectors(paddle.position, paddleLastPosition)
      .divideScalar(delta);
    paddleLastPosition.copy(paddle.position);

    const lerpFactor = 1 - Math.exp(-PADDLE_LERP_FACTOR * delta);
    paddle.position.x = THREE.MathUtils.lerp(
      paddle.position.x,
      paddleTargetPosition.x,
      lerpFactor,
    );
    paddle.position.y = THREE.MathUtils.lerp(
      paddle.position.y,
      paddleTargetPosition.y,
      lerpFactor,
    );
    updatePowerUpTimers(delta);

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      const spin = ball.userData.spin;
      const velocity = ball.userData.velocity;
      const spinHelper = ball.userData.spinHelper;
      // --- NEW: Check for "Hot Spin" Power Up ---
      const isPowered = spin.length() >= SPIN_POWER_THRESHOLD;
      ball.userData.isPowered = isPowered;
      if (isPowered) {
        ball.material.emissive.setHex(POWER_COLOR);
        spinHelper.material.color.setHex(POWER_COLOR);
      } else {
        ball.material.emissive.setHex(0xcccc00); // Reset emissive
        spinHelper.material.color.setHex(0x00ffff); // Reset helper color
      }
      // Apply Magnus Force (curve) and Spin Decay
      if (spin.length() > 0.1) {
        const magnusForce = new THREE.Vector3().crossVectors(spin, velocity);
        magnusForce.multiplyScalar(MAGNUS_COEFFICIENT);
        velocity.add(magnusForce);
        spin.multiplyScalar(1 - SPIN_DECAY * delta);

        // --- VISUALIZE SPIN ---
        // 1. Rotate the ball mesh
        const rotationAngle = spin.length() * VISUAL_SPIN_MULTIPLIER;
        const rotationAxis = spin.clone().normalize();
        const quaternion = new THREE.Quaternion().setFromAxisAngle(
          rotationAxis,
          rotationAngle,
        );
        ball.quaternion.premultiply(quaternion);

        // 2. Update the helper ring
        const spinMagnitude = Math.min(spin.length() / MAX_SPIN, 1.0);
        spinHelper.material.opacity = Math.sqrt(spinMagnitude) * 0.85;
        spinHelper.lookAt(spin.clone().add(ball.position)); // Orient the ring
      } else {
        spinHelper.material.opacity = 0; // Hide if no spin
      }
      // --- MODIFIED: Time Dilation Logic ---
      let timeScale = 1.0;
      const distToPaddle = Math.abs(ball.position.z - paddle.position.z);
      if (velocity.z > 0 && distToPaddle < TIME_DILATION_ZONE_DEPTH) {
          // Ball is moving towards the paddle and is inside the zone
          const closeness = 1 - (distToPaddle / TIME_DILATION_ZONE_DEPTH); // 0 to 1
          // --- MODIFIED: Apply an easing function for a smoother slowdown ---
          const easedCloseness = closeness * closeness; // Ease-in quad
          timeScale = THREE.MathUtils.lerp(1.0, TIME_DILATION_FACTOR, easedCloseness);
      }

      ball.position.add(velocity.clone().multiplyScalar(delta * timeScale));


      if (ball.position.z > TUBE_DEPTH / 2 + 20) {
        scene.remove(ball);
        balls.splice(i, 1);
      }
    }

    powerUps.forEach((p) => {
      p.position.add(p.userData.velocity.clone().multiplyScalar(delta));
      p.rotation.x += delta * 2;
      p.rotation.y += delta * 2;
    });

    handleCollisions();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const ps = particles[i];
    ps.userData.life -= delta;
    if (ps.userData.life <= 0) {
      scene.remove(ps);
      particles.splice(i, 1);
    } else {
      const positions = ps.geometry.attributes.position.array;
      for (let j = 0; j < ps.userData.velocities.length; j++) {
        positions[j * 3] += ps.userData.velocities[j].x * delta;
        positions[j * 3 + 1] += ps.userData.velocities[j].y * delta;
        positions[j * 3 + 2] += ps.userData.velocities[j].z * delta;
      }
      ps.geometry.attributes.position.needsUpdate = true;
      ps.material.opacity = ps.userData.life;
    }
  }

  if (paddleEffect.shineTimer > 0) {
    paddleEffect.shineTimer -= delta;
    const shineProgress = paddleEffect.shineTimer / PADDLE_EFFECT_DURATION;
    const intensity = Math.sin(shineProgress * Math.PI) * 0.5;
    paddle.material.emissive.setHex(0xbbddff).multiplyScalar(intensity);
  } else {
    paddle.material.emissive.setHex(0x555555);
  }

  if (paddleEffect.wobbleTimer > 0) {
    paddleEffect.wobbleTimer -= delta;
    const wobbleProgress = paddleEffect.wobbleTimer / PADDLE_EFFECT_DURATION;
    const wobbleAmount =
      Math.sin(wobbleProgress * Math.PI * 4) * (wobbleProgress * 0.06);
    paddle.rotation.z = wobbleAmount;
    paddle.rotation.x = -wobbleAmount;
  } else {
    paddle.rotation.set(0, 0, 0);
  }

  if (screenShake.timer < screenShake.duration) {
    screenShake.timer += delta;
    const shake =
      (Math.random() - 0.5) *
      screenShake.intensity *
      (1 - screenShake.timer / screenShake.duration);
    camera.position.x += shake;
    camera.position.y += shake;
  } else if (camera.position.x !== 0 || camera.position.y !== 0) {
    camera.position.x = 0;
    camera.position.y = 0;
  }

  renderer.render(scene, camera);
}

init();