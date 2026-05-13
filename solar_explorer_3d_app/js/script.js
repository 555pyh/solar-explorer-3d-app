import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene;
let camera;
let renderer;
let controls;

let currentModel;
let currentSystem;

let pointLight;
let ambientLight;
let moonPhaseLight;
let sunlightArrowGroup;

let isRotating = true;
let isWireframe = false;
let lightOn = true;

let activeView = "sun";
let earthOrbitPivot;
let moonOrbitPivot;
let systemEarth;
let systemMoon;

let rocketModel;
let rocketProgress = 0;
let rocketSpeed = 0.0035;
let rocketFlightActive = false;
let rocketArrived = false;
let launchAfterLoad = false;

let rocketStartPoint = null;
let rocketEndPoint = null;
let rocketControlPoint = null;

let cloudObjects = [];
let sceneLoadId = 0;

const container = document.getElementById("three-container");

init();
showInfo(getInitialView());
animate();

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  const allowedViews = [
    "sun",
    "earth",
    "moon",
    "sunEarth",
    "earthMoon",
    "fullSystem"
  ];

  if (allowedViews.includes(view)) {
    return view;
  }

  return "sun";
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );

  camera.position.set(0, 1.5, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  pointLight = new THREE.PointLight(0xffaa33, 5, 50);
  pointLight.position.set(3, 3, 4);
  scene.add(pointLight);

  window.addEventListener("resize", onWindowResize);
}

function beginSceneChange() {
  sceneLoadId += 1;
  clearCurrentObjects();
  return sceneLoadId;
}

function clearCurrentObjects() {
  cloudObjects = [];

  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  if (currentSystem) {
    scene.remove(currentSystem);
    currentSystem = null;
  }

  earthOrbitPivot = null;
  moonOrbitPivot = null;
  systemEarth = null;
  systemMoon = null;

  rocketModel = null;
  rocketProgress = 0;
  rocketFlightActive = false;
  rocketArrived = false;

  rocketStartPoint = null;
  rocketEndPoint = null;
  rocketControlPoint = null;

  moonPhaseLight = null;
  sunlightArrowGroup = null;

  if (ambientLight) {
    ambientLight.intensity = lightOn ? 1.0 : 0.15;
  }

  if (pointLight) {
    pointLight.visible = lightOn;
  }
}

function loadModel(modelPath, scaleValue) {
  const loadId = beginSceneChange();
  const loader = new GLTFLoader();

  loader.load(
    modelPath,
    function (gltf) {
      if (loadId !== sceneLoadId) {
        return;
      }

      currentModel = gltf.scene;
      removeImportedCamerasAndLights(currentModel);

      currentModel.position.set(0, 0, 0);
      currentModel.scale.set(scaleValue, scaleValue, scaleValue);

      scene.add(currentModel);

      registerCloudObjects(currentModel);
      applyWireframeToObject(currentModel);

      camera.position.set(0, 1.5, 6);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    undefined,
    function (error) {
      console.error("Model loading failed:", error);
    }
  );
}

function loadSystemModel(modelPath, targetDiameter) {
  const loader = new GLTFLoader();

  return new Promise(function (resolve, reject) {
    loader.load(
      modelPath,
      function (gltf) {
        const model = gltf.scene;
        removeImportedCamerasAndLights(model);

        const preparedModel = prepareModelForSystem(model, targetDiameter);
        applyWireframeToObject(preparedModel);

        resolve(preparedModel);
      },
      undefined,
      function (error) {
        console.error("System model loading failed:", error);
        reject(error);
      }
    );
  });
}

function removeImportedCamerasAndLights(root) {
  const objectsToRemove = [];

  root.traverse(function (child) {
    if (child.isCamera || child.isLight) {
      objectsToRemove.push(child);
    }
  });

  objectsToRemove.forEach(function (object) {
    if (object.parent) {
      object.parent.remove(object);
    }
  });
}

function registerCloudObjects(root) {
  root.traverse(function (child) {
    const objectName = child.name ? child.name.toLowerCase() : "";

    if (
      child.isMesh &&
      (objectName.includes("cloud") || objectName.includes("云"))
    ) {
      cloudObjects.push(child);

      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach(function (material) {
          material.transparent = true;
          material.depthWrite = false;
          material.alphaTest = 0.02;
          material.needsUpdate = true;
        });
      }
    }
  });
}

function prepareModelForSystem(model, targetDiameter) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  model.position.x -= center.x;
  model.position.y -= center.y;
  model.position.z -= center.z;

  const wrapper = new THREE.Group();
  wrapper.add(model);

  const maxSize = Math.max(size.x, size.y, size.z);

  if (maxSize > 0) {
    const scaleValue = targetDiameter / maxSize;
    wrapper.scale.set(scaleValue, scaleValue, scaleValue);
  }

  return wrapper;
}

function createOrbitLine(radius) {
  const points = [];
  const segments = 160;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;

    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      )
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.45
  });

  return new THREE.Line(geometry, material);
}

function createAxisLine(length) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -length / 2, 0),
    new THREE.Vector3(0, length / 2, 0)
  ]);

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75
  });

  return new THREE.Line(geometry, material);
}

function createSunlightArrows() {
  const group = new THREE.Group();

  const arrowDirection = new THREE.Vector3(-1, 0, 0).normalize();
  const arrowColor = 0xffd447;

  const arrowPositions = [
    new THREE.Vector3(2.75, 0.75, 0),
    new THREE.Vector3(2.75, 0.25, 0),
    new THREE.Vector3(2.75, -0.25, 0)
  ];

  arrowPositions.forEach(function (position) {
    const arrow = new THREE.ArrowHelper(
      arrowDirection,
      position,
      0.75,
      arrowColor,
      0.18,
      0.11
    );

    group.add(arrow);
  });

  const label = createTextSprite("Light from Sun", "#ffd447");
  label.position.set(2.55, 1.08, 0);
  group.add(label);

  return group;
}

function createTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.font = "bold 42px Arial";
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);

  return sprite;
}

function improveLightResponse(object) {
  object.traverse(function (child) {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach(function (material) {
        if (material.metalness !== undefined) {
          material.metalness = 0;
        }

        if (material.roughness !== undefined) {
          material.roughness = 1;
        }

        if (material.emissive) {
          material.emissive.set(0x000000);
        }

        material.needsUpdate = true;
      });
    }
  });
}

async function createSunEarthSystem() {
  const loadId = beginSceneChange();

  currentSystem = new THREE.Group();
  scene.add(currentSystem);

  const orbitLine = createOrbitLine(2.7);
  currentSystem.add(orbitLine);

  camera.position.set(0, 3.2, 6);
  controls.target.set(0, 0, 0);
  controls.update();

  try {
    const models = await Promise.all([
      loadSystemModel("assets/models/sun.glb", 1.35),
      loadSystemModel("assets/models/earth.glb", 0.5)
    ]);

    if (loadId !== sceneLoadId) {
      return;
    }

    const sunModel = models[0];
    const earthModel = models[1];

    sunModel.position.set(0, 0, 0);
    currentSystem.add(sunModel);

    earthOrbitPivot = new THREE.Group();

    systemEarth = new THREE.Group();
    systemEarth.position.set(2.7, 0, 0);
    systemEarth.rotation.z = THREE.MathUtils.degToRad(23.5);

    systemEarth.add(earthModel);
    registerCloudObjects(systemEarth);
    systemEarth.add(createAxisLine(0.8));

    earthOrbitPivot.add(systemEarth);
    currentSystem.add(earthOrbitPivot);

    applyWireframeToObject(currentSystem);
  } catch (error) {
    console.error("Sun-Earth system failed:", error);
  }
}

async function createEarthMoonSystem() {
  const loadId = beginSceneChange();

  currentSystem = new THREE.Group();
  scene.add(currentSystem);

  const orbitLine = createOrbitLine(1.7);
  currentSystem.add(orbitLine);

  sunlightArrowGroup = createSunlightArrows();
  currentSystem.add(sunlightArrowGroup);

  moonPhaseLight = new THREE.DirectionalLight(0xffffff, 3.2);
  moonPhaseLight.position.set(4, 0.8, 0);
  moonPhaseLight.target.position.set(0, 0, 0);
  moonPhaseLight.visible = lightOn;

  currentSystem.add(moonPhaseLight);
  currentSystem.add(moonPhaseLight.target);

  if (ambientLight) {
    ambientLight.intensity = lightOn ? 0.28 : 0.12;
  }

  if (pointLight) {
    pointLight.visible = false;
  }

  camera.position.set(0, 2.3, 5);
  controls.target.set(0, 0, 0);
  controls.update();

  try {
    const models = await Promise.all([
      loadSystemModel("assets/models/earth.glb", 1.05),
      loadSystemModel("assets/models/moon.glb", 0.28),
      loadSystemModel("assets/models/rocket.glb", 0.20)
    ]);

    if (loadId !== sceneLoadId) {
      return;
    }

    const earthModel = models[0];
    const moonModel = models[1];
    rocketModel = models[2];

    improveLightResponse(earthModel);
    improveLightResponse(moonModel);

    systemEarth = new THREE.Group();
    systemEarth.rotation.z = THREE.MathUtils.degToRad(23.5);
    systemEarth.add(earthModel);
    registerCloudObjects(systemEarth);
    systemEarth.add(createAxisLine(1.35));
    currentSystem.add(systemEarth);

    moonOrbitPivot = new THREE.Group();

    systemMoon = new THREE.Group();
    systemMoon.position.set(1.7, 0, 0);
    systemMoon.add(moonModel);

    moonOrbitPivot.add(systemMoon);
    currentSystem.add(moonOrbitPivot);

    rocketProgress = 0;
    rocketFlightActive = false;
    rocketArrived = false;

    rocketStartPoint = null;
    rocketEndPoint = null;
    rocketControlPoint = null;

    rocketModel.visible = false;
    currentSystem.add(rocketModel);

    applyWireframeToObject(currentSystem);

    if (launchAfterLoad) {
      launchAfterLoad = false;
      launchRocket();
    }
  } catch (error) {
    console.error("Earth-Moon system failed:", error);
  }
}

function createRocketFlightPath() {
  if (!systemMoon || !currentSystem) {
    return;
  }

  const moonPosition = new THREE.Vector3();
  systemMoon.getWorldPosition(moonPosition);
  currentSystem.worldToLocal(moonPosition);

  const directionToMoon = moonPosition.clone();

  if (directionToMoon.length() === 0) {
    directionToMoon.set(1, 0, 0);
  }

  directionToMoon.normalize();

  rocketStartPoint = directionToMoon.clone().multiplyScalar(0.68);
  rocketStartPoint.y += 0.06;

  rocketEndPoint = null;
  rocketControlPoint = null;
}

function updateRocketFlight() {
  if (!rocketModel || !rocketStartPoint || !systemMoon || !currentSystem) {
    return;
  }

  const moonPosition = new THREE.Vector3();
  systemMoon.getWorldPosition(moonPosition);
  currentSystem.worldToLocal(moonPosition);

  const end = moonPosition.clone().multiplyScalar(0.92);
  end.y += 0.08;

  const control = rocketStartPoint.clone().lerp(end, 0.5);
  control.y += 0.65;

  rocketEndPoint = end;
  rocketControlPoint = control;

  const t = Math.min(rocketProgress, 1);
  const oneMinusT = 1 - t;

  const position = new THREE.Vector3();
  position
    .addScaledVector(rocketStartPoint, oneMinusT * oneMinusT)
    .addScaledVector(control, 2 * oneMinusT * t)
    .addScaledVector(end, t * t);

  rocketModel.position.copy(position);

  const tangent = new THREE.Vector3()
    .addScaledVector(control.clone().sub(rocketStartPoint), 2 * oneMinusT)
    .addScaledVector(end.clone().sub(control), 2 * t)
    .normalize();

  const rocketForwardDirection = new THREE.Vector3(0, 1, 0);
  rocketModel.quaternion.setFromUnitVectors(rocketForwardDirection, tangent);
}

async function createSunEarthMoonSystem() {
  const loadId = beginSceneChange();

  currentSystem = new THREE.Group();
  scene.add(currentSystem);

  const earthOrbitLine = createOrbitLine(2.7);
  currentSystem.add(earthOrbitLine);

  camera.position.set(0, 3.4, 7);
  controls.target.set(0, 0, 0);
  controls.update();

  try {
    const models = await Promise.all([
      loadSystemModel("assets/models/sun.glb", 1.1),
      loadSystemModel("assets/models/earth.glb", 0.42),
      loadSystemModel("assets/models/moon.glb", 0.18)
    ]);

    if (loadId !== sceneLoadId) {
      return;
    }

    const sunModel = models[0];
    const earthModel = models[1];
    const moonModel = models[2];

    sunModel.position.set(0, 0, 0);
    currentSystem.add(sunModel);

    earthOrbitPivot = new THREE.Group();

    systemEarth = new THREE.Group();
    systemEarth.position.set(2.7, 0, 0);
    systemEarth.rotation.z = THREE.MathUtils.degToRad(23.5);
    systemEarth.add(earthModel);
    registerCloudObjects(systemEarth);
    systemEarth.add(createAxisLine(0.65));

    moonOrbitPivot = new THREE.Group();
    moonOrbitPivot.position.set(2.7, 0, 0);

    const moonOrbitLine = createOrbitLine(0.65);
    moonOrbitPivot.add(moonOrbitLine);

    systemMoon = new THREE.Group();
    systemMoon.position.set(0.65, 0, 0);
    systemMoon.add(moonModel);

    moonOrbitPivot.add(systemMoon);

    earthOrbitPivot.add(systemEarth);
    earthOrbitPivot.add(moonOrbitPivot);

    currentSystem.add(earthOrbitPivot);

    applyWireframeToObject(currentSystem);
  } catch (error) {
    console.error("Full system failed:", error);
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (currentModel && isRotating) {
    currentModel.rotation.y += 0.0012;
  }

  if (cloudObjects.length > 0 && isRotating) {
    cloudObjects.forEach(function (cloud) {
      cloud.rotation.y += 0.0015;
    });
  }

  if (activeView === "sunEarth" && earthOrbitPivot && isRotating) {
    earthOrbitPivot.rotation.y += 0.002;

    if (systemEarth) {
      systemEarth.rotation.y += 0.004;
    }
  }

  if (activeView === "earthMoon" && moonOrbitPivot && isRotating) {
    moonOrbitPivot.rotation.y += 0.003;

    if (systemEarth) {
      systemEarth.rotation.y += 0.003;
    }

    if (systemMoon) {
      systemMoon.rotation.y += 0.003;
    }

    if (rocketModel && rocketFlightActive) {
      rocketProgress += rocketSpeed;

      if (rocketProgress >= 1) {
        rocketProgress = 1;
        updateRocketFlight();

        rocketFlightActive = false;
        rocketArrived = false;
        rocketModel.visible = false;
      } else {
        updateRocketFlight();
      }
    }
  }

  if (
    activeView === "fullSystem" &&
    earthOrbitPivot &&
    moonOrbitPivot &&
    isRotating
  ) {
    earthOrbitPivot.rotation.y += 0.002;
    moonOrbitPivot.rotation.y += 0.006;

    if (systemEarth) {
      systemEarth.rotation.y += 0.004;
    }

    if (systemMoon) {
      systemMoon.rotation.y += 0.003;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function applyWireframeToObject(object) {
  object.traverse(function (child) {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(function (material) {
          material.wireframe = isWireframe;
        });
      } else {
        child.material.wireframe = isWireframe;
      }
    }
  });
}

function setActiveButton(index) {
  const buttons = document.querySelectorAll(
    "#model-selection-buttons .control-btn"
  );

  buttons.forEach(function (button) {
    button.classList.remove("active");
  });

  if (buttons[index]) {
    buttons[index].classList.add("active");
  }
}

function showInfo(viewName) {
  activeView = viewName;

  const title = document.getElementById("model-title");
  const description = document.getElementById("model-description");

  if (viewName === "sun") {
    title.textContent = "Sun";
    description.textContent =
      "The Sun is the central star of the Solar System and the main source of light and heat for Earth. It is about 1.39 million kilometres in diameter, which means more than one million Earths could fit inside it by volume. The Sun is about 150 million kilometres away from Earth, a distance known as one astronomical unit. It is mainly made of hydrogen and helium. Deep inside its core, hydrogen atoms are fused into helium through nuclear fusion, releasing a huge amount of energy. This energy travels outward and eventually reaches Earth as sunlight. The Sun also has different layers, including the core, radiative zone, convective zone, photosphere, chromosphere and corona. Although it looks calm from Earth, the Sun is very active, with sunspots, solar flares and solar wind affecting space weather around the Solar System.";
    setActiveButton(0);
    loadModel("assets/models/sun.glb", 1.2);
  }

  if (viewName === "earth") {
    title.textContent = "Earth";
    description.textContent =
      "Earth is the third planet from the Sun and the only planet currently known to support life. It has a diameter of about 12,742 kilometres and orbits the Sun at an average distance of about 150 million kilometres. Earth is a rocky planet with a solid surface, liquid water, an atmosphere and a magnetic field. Around 71% of its surface is covered by oceans, which play an important role in climate and the water cycle. The atmosphere is mainly made of nitrogen and oxygen, and it protects life by reducing harmful solar radiation and burning up many small meteoroids. Earth rotates once every roughly 24 hours, creating day and night. It also orbits the Sun once every 365.25 days. Its axis is tilted by about 23.5 degrees, which is the main reason different parts of Earth experience seasons during the year.";
    setActiveButton(1);
    loadModel("assets/models/earth.glb", 1.1);
  }

  if (viewName === "moon") {
    title.textContent = "Moon";
    description.textContent =
      "The Moon is Earth's only natural satellite and is the closest large celestial body to Earth. It is about 3,474 kilometres in diameter, roughly one quarter of Earth's diameter, and its average distance from Earth is about 384,400 kilometres. The Moon has a rocky surface covered with craters, mountains, valleys and darker flat plains called lunar maria. These maria were formed by ancient volcanic activity and can be seen from Earth with the naked eye. The Moon has very little atmosphere, so its surface is directly exposed to space. It takes about 27.3 days to orbit Earth once, but the full cycle of lunar phases takes about 29.5 days because Earth is also moving around the Sun. The Moon is tidally locked, which means the same side of the Moon mostly faces Earth all the time.";
    setActiveButton(2);
    loadModel("assets/models/moon.glb", 1.2);
  }

  if (viewName === "sunEarth") {
    title.textContent = "Sun-Earth System";
    description.textContent =
      "The Sun-Earth system explains the relationship between Earth's orbit, sunlight and the seasons. Earth travels around the Sun in an elliptical orbit, but the orbit is close to circular, so distance from the Sun is not the main cause of seasons. The most important factor is Earth's axial tilt of about 23.5 degrees. As Earth moves around the Sun, different hemispheres receive sunlight at different angles. When the Northern Hemisphere is tilted toward the Sun, it receives more direct sunlight and longer days, producing summer there. At the same time, the Southern Hemisphere is tilted away from the Sun and experiences winter. Six months later, the situation is reversed. This is why seasons are opposite in the Northern and Southern Hemispheres. The system also helps explain solstices, equinoxes and changes in day length throughout the year.";
    setActiveButton(3);
    createSunEarthSystem();
  }

  if (viewName === "earthMoon") {
    title.textContent = "Earth-Moon System";
    description.textContent =
      "The Earth-Moon system explains the Moon's orbit, lunar phases and the relationship between Earth, Moon and sunlight. The Moon orbits Earth while both objects are lit by the Sun. At any time, half of the Moon is illuminated by sunlight, but from Earth we see different amounts of that illuminated half as the Moon moves around us. This creates the familiar lunar phases, including new moon, crescent moon, first quarter, gibbous moon and full moon. Normal Moon phases are not caused by Earth blocking the Moon. Earth only blocks sunlight from reaching the Moon during a lunar eclipse, which happens much less often. The Moon's gravity also affects Earth by producing tides in the oceans. Historically, the Moon has been important for navigation, calendars and space exploration. Apollo 11 became the first crewed mission to land humans on the Moon in 1969.";
    setActiveButton(4);
    createEarthMoonSystem();
  }

  if (viewName === "fullSystem") {
    title.textContent = "Sun-Earth-Moon System";
    description.textContent =
      "The Sun-Earth-Moon system combines several important astronomical relationships. Earth orbits the Sun once per year, while the Moon orbits Earth roughly once per month. At the same time, Earth rotates on its axis once per day. These motions together explain many patterns people observe in the sky, such as day and night, seasons, lunar phases and eclipses. The Sun provides the light, Earth receives and reflects that light, and the Moon reflects sunlight toward Earth. Seasons are mainly caused by Earth's axial tilt, while Moon phases are caused by the changing view of the Moon's sunlit half. Eclipses happen only when the Sun, Earth and Moon line up closely. A solar eclipse occurs when the Moon passes between Earth and the Sun, while a lunar eclipse occurs when Earth passes between the Sun and the Moon. This system shows how different motions in space are connected.";
    setActiveButton(5);
    createSunEarthMoonSystem();
  }
}

function launchRocket() {
  if (activeView !== "earthMoon") {
    launchAfterLoad = true;
    showInfo("earthMoon");
    return;
  }

  if (!rocketModel) {
    launchAfterLoad = true;
    return;
  }

  rocketProgress = 0;
  rocketFlightActive = true;
  rocketArrived = false;

  createRocketFlightPath();

  rocketModel.visible = true;
  updateRocketFlight();

  updateRocketStory(
  "Rocket launch started. This animation is inspired by Apollo 11, the first crewed mission to land humans on the Moon in 1969. The mission carried Neil Armstrong, Buzz Aldrin and Michael Collins. Armstrong and Aldrin landed on the lunar surface, while Collins remained in orbit around the Moon in the command module. In this scene, the rocket represents human space exploration and shows the idea of travelling from Earth toward the Moon. The real journey to the Moon took about three days, but the animation is simplified so users can clearly see the relationship between Earth, the Moon and space travel."
);
}

function updateRocketStory(text) {
  if (activeView !== "earthMoon") {
    return;
  }

  const description = document.getElementById("model-description");

  if (description) {
    description.textContent = text;
  }
}

function rotateModel() {
  isRotating = true;
}

function stopModel() {
  isRotating = false;
}

function toggleWireframe() {
  isWireframe = !isWireframe;

  if (currentModel) {
    applyWireframeToObject(currentModel);
  }

  if (currentSystem) {
    applyWireframeToObject(currentSystem);
  }
}

function setCameraView(view) {
  if (view === "front") {
    camera.position.set(0, 1.5, 6);
  }

  if (view === "side") {
    camera.position.set(6, 1.5, 0);
  }

  if (view === "top") {
    camera.position.set(0, 7, 0.1);
  }

  controls.target.set(0, 0, 0);
  controls.update();
}

function toggleLight() {
  lightOn = !lightOn;

  if (activeView === "earthMoon") {
    if (moonPhaseLight) {
      moonPhaseLight.visible = lightOn;
    }

    if (ambientLight) {
      ambientLight.intensity = lightOn ? 0.28 : 0.12;
    }

    if (pointLight) {
      pointLight.visible = false;
    }

    return;
  }

  if (pointLight) {
    pointLight.visible = lightOn;
  }

  if (ambientLight) {
    ambientLight.intensity = lightOn ? 1.0 : 0.15;
  }
}

window.showInfo = showInfo;
window.rotateModel = rotateModel;
window.stopModel = stopModel;
window.toggleWireframe = toggleWireframe;
window.setCameraView = setCameraView;
window.toggleLight = toggleLight;
window.launchRocket = launchRocket;