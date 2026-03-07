import { GeospatialClippingBehavior } from '@babylonjs/core/Behaviors/Cameras';
import { Atmosphere } from '@babylonjs/addons/atmosphere';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins';
import GUI from 'lil-gui';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { GeospatialCamera } from '@babylonjs/core/Cameras/geospatialCamera';
import { Vector3, Vector2 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';


const GOOGLE_TILES_ASSET_ID = 2275207;
const CESIUM_ION_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MDdmNDk0Zi1jNmI5LTRlMDUtOTllYy03YWM5MWE3MzliNGMiLCJpZCI6Mzc2NDg4LCJpYXQiOjE3Njc5MTA0NTV9.rY4cDMkz0cAv8al_nkk2KuJ8Omdo9AuHV-j3aR0W_FI';
// 'CESIUM_ION_KEY'; // Insert key here during local development. Will get auto-injected in CI 
const PLANET_RADIUS = 6378137;

// WGS84 geodetic (lat/lon/alt) to ECEF conversion
// Once upstreamed to Babylon.js, these can be removed
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

function latLonAltToEcef( latDeg: number, lonDeg: number, alt: number ) {

	const lat = ( latDeg * Math.PI ) / 180;
	const lon = ( lonDeg * Math.PI ) / 180;
	const sinLat = Math.sin( lat );
	const cosLat = Math.cos( lat );
	const sinLon = Math.sin( lon );
	const cosLon = Math.cos( lon );
	const N = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sinLat * sinLat );

	const x = ( N + alt ) * cosLat * cosLon;
	const y = ( N + alt ) * cosLat * sinLon;
	const z = ( N * ( 1 - WGS84_E2 ) + alt ) * sinLat;

	return [ x, y, z ];

}

function ecefToLatLonAlt( x: number, y: number, z: number ) {

	const lon = Math.atan2( y, x );
	const p = Math.sqrt( x * x + y * y );
	let lat = Math.atan2( z, p * ( 1 - WGS84_E2 ) );
	for ( let i = 0; i < 5; i ++ ) {

		const sinLat = Math.sin( lat );
		const N = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sinLat * sinLat );
		lat = Math.atan2( z + WGS84_E2 * N * sinLat, p );

	}

	const sinLat = Math.sin( lat );
	const N = WGS84_A / Math.sqrt( 1 - WGS84_E2 * sinLat * sinLat );
	const alt = p / Math.cos( lat ) - N;

	return [ ( lat * 180 ) / Math.PI, ( lon * 180 ) / Math.PI, alt ];

}

// gui
const params = {
	enabled: true,
	visibleTiles: 0,
	errorTarget: 12, // Lower value = more detail, less LOD overlap/z-fighting
	timeOfDay: 14, // default to afternoon
	mieScattering: 5,
	rayleighScattering: 2,
	ozoneAbsorption: 2,
	exposure: 1.5,
};

const gui = new GUI();
gui.add( params, 'enabled' );
gui.add( params, 'visibleTiles' ).name( 'Visible Tiles' ).listen().disable();
gui.add( params, 'errorTarget', 1, 100 );
const timeCtrl = gui.add( params, 'timeOfDay', 0, 24, 0.1 ).name( 'Time of Day' ).listen();

// Time-of-day animation — variable speed: slower during daylight, faster at night
let animatingTime = false;
let lastAnimTime = 0;
const DAY_SPEED = 1.5; // hours/sec during daytime (6–18)
const NIGHT_SPEED = 6; // hours/sec during nighttime

const animBtn = gui.add( { toggleTimeAnimation() {

	animatingTime = ! animatingTime;
	if ( animatingTime ) lastAnimTime = performance.now();
	animBtn.name( animatingTime ? '⏸ Pause' : '▶ Play Time Cycle' );

} }, 'toggleTimeAnimation' ).name( '▶ Play Time Cycle' );

const atmosphereFolder = gui.addFolder( 'Atmosphere' );
atmosphereFolder.add( params, 'mieScattering', 0, 10, 0.1 ).name( 'Mie (sunset glow)' );
atmosphereFolder.add( params, 'rayleighScattering', 0, 5, 0.1 ).name( 'Rayleigh (blue sky)' );
atmosphereFolder.add( params, 'ozoneAbsorption', 0, 5, 0.1 ).name( 'Ozone' );
atmosphereFolder.add( params, 'exposure', 0, 5, 0.1 ).name( 'Exposure' );

// engine
const canvas = document.getElementById( 'renderCanvas' ) as HTMLCanvasElement;
const engine = new Engine( canvas, true, { useLargeWorldRendering: true } );
engine.setHardwareScalingLevel( 1 / window.devicePixelRatio );

// scene
const scene = new Scene( engine );
scene.clearColor = new Color4( 0.4, 0.6, 0.9, 1 );

// 3D Tiles data uses right-handed coordinate system
scene.useRightHandedSystem = true;

// camera
const camera = new GeospatialCamera( 'geo', scene, { planetRadius: PLANET_RADIUS } );

camera.attachControl( true );
const clippingBehavior = new GeospatialClippingBehavior();
camera.addBehavior( clippingBehavior );

// Parse URL hash for initial coordinates (#lat=40.7&lon=-73.9&alt=500)
const hashParams = new URLSearchParams( window.location.hash.substring( 1 ) );
const urlLat = hashParams.get( 'lat' );
const urlLon = hashParams.get( 'lon' );
const urlAlt = hashParams.get( 'alt' );

let initialLat = 40.782773; // Central Park, NYC
let initialLon = - 73.965363;
let initialAlt = 600;
let initialRadius = initialAlt;

if ( urlLat && urlLon ) {

	initialLat = parseFloat( urlLat );
	initialLon = parseFloat( urlLon );
	initialAlt = urlAlt ? parseFloat( urlAlt ) : 300;
	initialRadius = initialAlt;

}

const [ initialX, initialY, initialZ ] = latLonAltToEcef( initialLat, initialLon, 0 );


// Set center to initial location (ECEF coordinates)
// Set limits and radius BEFORE pitch — pitch limits depend on radius,
// so setting pitch while radius is still at the huge default value clamps it to 0.
camera.limits.radiusMin = 25;
camera.limits.pitchDisabledRadiusScale = new Vector2( 0.5, 1.5 );
camera.limits.radiusMax = PLANET_RADIUS*2;
camera.center = new Vector3( initialX, initialY, initialZ );
camera.radius = initialRadius;
camera.pitch = 1.167625429373872;
camera.yaw = - 0.2513281792775774;


camera.checkCollisions = true;
scene.collisionsEnabled = true;

// atmosphere
const sun = new DirectionalLight( 'sun', Vector3.Up(), scene );
sun.intensity = 3;

// Ambient fill light — provides moonlight / skylight so nighttime isn't pitch black
const ambientLight = new HemisphericLight( 'ambient', Vector3.Up(), scene );
ambientLight.intensity = 0;

const atmosphere = new Atmosphere( 'atmosphere', scene, [ sun ], {
	isLinearSpaceLight: true,
	isLinearSpaceComposition: true,
	exposure: 1.5,
	multiScatteringIntensity: 1.2,
} );

// Slight scattering boost for more vivid sunrises/sunsets
atmosphere.physicalProperties.mieScatteringScale = 1.5;
atmosphere.physicalProperties.rayleighScatteringScale = 1.2;
atmosphere.physicalProperties.ozoneAbsorptionScale = 1.0;

// Time-of-day sun positioning
// Computes local up/east/north at camera center, then sweeps the sun in a realistic arc.
const _up = new Vector3();
const _east = new Vector3();
const _north = new Vector3();
const _sunDirection = new Vector3();
const _tmpVec = new Vector3();
const _northPole = new Vector3( 0, 0, 1 ); // Z-axis in ECEF

function updateSunFromTimeOfDay( timeOfDay: number ) {

	// Local coordinate frame at camera position on the globe
	_up.copyFrom( camera.center ).normalize();
	Vector3.CrossToRef( _northPole, _up, _east );
	_east.normalize();
	Vector3.CrossToRef( _up, _east, _north );
	_north.normalize();

	// Sun arc — hour angle sweeps east→west, elevation peaks at noon
	const hourAngle = ( ( timeOfDay - 12 ) / 24 ) * Math.PI * 2; // 0 at noon
	const elevation = Math.cos( hourAngle ); // 1 at noon, -1 at midnight
	const horizontal = Math.sin( hourAngle ); // east(-) to west(+)

	// Direction toward the sun = elevation*up + horizontal*east (+ slight north tilt)
	_up.scaleToRef( Math.max( elevation, - 0.3 ), _sunDirection );
	_east.scaleToRef( - horizontal, _tmpVec );
	_sunDirection.addInPlace( _tmpVec );
	_north.scaleToRef( 0.2, _tmpVec ); // slight northward tilt for realism
	_sunDirection.addInPlace( _tmpVec );
	_sunDirection.normalize();

	// DirectionalLight direction points FROM the sun
	_sunDirection.scaleToRef( - 1, _tmpVec );
	sun.direction = _tmpVec;

	// Intensity based on sun elevation — atmosphere handles diffuse color via transmittance
	sun.intensity = elevation > 0 ? 2 + elevation * 2 : Math.max( 0.5, 0.5 + elevation * 2 );

	// Ramp up ambient fill as sun drops below horizon
	ambientLight.intensity = elevation < 0.1 ? 0.6 * ( 1 - Math.max( 0, elevation ) / 0.1 ) : 0;
	_up.copyFrom( camera.center ).normalize();
	ambientLight.direction.copyFrom( _up ).scaleInPlace( - 1 );

	// Blend scene clear color: sky blue during day → dark navy at night
	const dayR = 0.4, dayG = 0.6, dayB = 0.9;
	const nightR = 0.05, nightG = 0.05, nightB = 0.15;
	const t = Math.max( 0, Math.min( 1, ( elevation + 0.1 ) / 0.3 ) );
	scene.clearColor.set(
		nightR + t * ( dayR - nightR ),
		nightG + t * ( dayG - nightG ),
		nightB + t * ( dayB - nightB ),
		1
	);


}

// tiles
const tiles = new TilesRenderer( '', scene );
tiles.registerPlugin( new CesiumIonAuthPlugin( {
	apiToken: CESIUM_ION_KEY,
	assetId: GOOGLE_TILES_ASSET_ID.toString(),
	autoRefreshToken: true,
} ) );
tiles.errorTarget = params.errorTarget;

// Configure tile meshes as they load
( tiles as any ).addEventListener( 'load-model', ( event: any ) => {
	const tileScene = event?.scene;
	if ( tileScene ) {
		const meshes = tileScene.getChildMeshes?.() ?? [];
		for ( const mesh of meshes ) {
			mesh.checkCollisions = true;

			const mat = mesh.material;
			if ( mat ) {

				// Google tiles use KHR_materials_unlit — disable so they respond to dynamic lighting
				mat.unlit = false;
				mat.backFaceCulling = true;
				mat.twoSidedLighting = false;

			}
		}
	}
} );

// Babylon render loop

scene.onBeforeRenderObservable.add( () => {

	// Advance time-of-day animation — slow during day, fast at night
	if ( animatingTime ) {

		const now = performance.now();
		const dt = ( now - lastAnimTime ) / 1000;
		lastAnimTime = now;
		const h = params.timeOfDay;
		const isDaytime = h >= 5 && h <= 19;
		const speed = isDaytime ? DAY_SPEED : NIGHT_SPEED;
		params.timeOfDay = ( h + dt * speed ) % 24;

	}

	updateSunFromTimeOfDay( params.timeOfDay );

	// Sync atmosphere sliders
	atmosphere.physicalProperties.mieScatteringScale = params.mieScattering;
	atmosphere.physicalProperties.rayleighScatteringScale = params.rayleighScattering;
	atmosphere.physicalProperties.ozoneAbsorptionScale = params.ozoneAbsorption;
	atmosphere.exposure = params.exposure;

	if ( params.enabled ) {

		tiles.errorTarget = params.errorTarget;
		tiles.update();
		params.visibleTiles = (tiles as any).visibleTiles.size;

	}

	// update attributions
	const attributions = tiles.getAttributions();
	const creditsEl = document.getElementById( 'credits' );
	if (creditsEl) {
		creditsEl.innerText = attributions[ 0 ]?.value;
	}

} );

engine.runRenderLoop( () => {

	scene.render();

} );

// Handle window resize
window.addEventListener( 'resize', () => {

	engine.resize();

} );

// --- Navigation panel via lil-gui ---
const navParams = {
	placeSearch: '',
	coordMode: 'Lat / Lon / Alt',
	lat: initialLat,
	lon: initialLon,
	alt: initialAlt,
	ecefX: initialX,
	ecefY: initialY,
	ecefZ: initialZ,
	ecefRadius: initialAlt,
	searchResult: ''
};

const navFolder = gui.addFolder( 'Navigation' );

async function doSearch() {

	const query = navParams.placeSearch.trim();
	if ( ! query ) return;

	navParams.searchResult = 'Searching...';
	setResult( 'Searching...' );

	try {

		const url = `https://nominatim.openstreetmap.org/search?q=${ encodeURIComponent( query ) }&format=json&limit=1`;
		const res = await fetch( url );

		if ( ! res.ok ) {

			throw new Error( `HTTP ${ res.status }: ${ res.statusText }` );

		}

		const data = await res.json();

		if ( data.length === 0 ) {

			navParams.searchResult = 'No results found.';
			setResult( 'No results found.' );
			return;

		}

		const place = data[ 0 ];
		navParams.lat = parseFloat( place.lat );
		navParams.lon = parseFloat( place.lon );

		// Fetch terrain elevation at this location
		let elevation = 0;
		try {
			const elevUrl = `https://api.open-elevation.com/api/v1/lookup?locations=${ navParams.lat },${ navParams.lon }`;
			const elevRes = await fetch( elevUrl );
			if ( elevRes.ok ) {
				const elevData = await elevRes.json();
				elevation = elevData.results?.[ 0 ]?.elevation ?? 0;
			}
		} catch {
			// Fall back to 0 elevation if API is unavailable
			elevation = 0;
		}
		const [ x, y, z ] = latLonAltToEcef( navParams.lat, navParams.lon, elevation + 200 );
		navParams.ecefX = x;
		navParams.ecefY = y;
		navParams.ecefZ = z;

		navParams.coordMode = 'Lat / Lon / Alt';
		updateCoordVisibility();

		navParams.searchResult = place.display_name;
		setResult( place.display_name );

		// Auto-jump to the found location
		camera.center = new Vector3( x, y, z );
		camera.radius = navParams.alt || 300;

	} catch ( e: unknown ) {

		navParams.searchResult = `Error: ${ (e as Error).message }`;
		setResult( navParams.searchResult );

	}

}

navFolder.add( navParams, 'placeSearch' ).name( 'Place' ).onFinishChange( doSearch );
navFolder.add( { search: doSearch }, 'search' ).name( 'Search' );

const resultEl = document.createElement( 'div' );
resultEl.style.cssText = 'padding: 3px 8px 3px 8px; color: #a2db3c; font-size: 11px; line-height: 1.5; word-wrap: break-word; display: none;';
navFolder.$children.appendChild( resultEl );

function setResult( text: string ) {

	resultEl.textContent = text;
	resultEl.style.display = text ? 'block' : 'none';

}

const coordFolder = navFolder.addFolder( 'Coordinates' );
coordFolder.close();

const coordModeCtrl = coordFolder.add( navParams, 'coordMode', [ 'Lat / Lon / Alt', 'ECEF (X / Y / Z)' ] ).name( 'Mode' );

const latCtrl = coordFolder.add( navParams, 'lat' ).name( 'Lat (°)' ).listen();
const lonCtrl = coordFolder.add( navParams, 'lon' ).name( 'Lon (°)' ).listen();
const altCtrl = coordFolder.add( navParams, 'alt' ).name( 'Alt (m)' ).listen();

const ecefXCtrl = coordFolder.add( navParams, 'ecefX' ).name( 'X' ).listen().hide();
const ecefYCtrl = coordFolder.add( navParams, 'ecefY' ).name( 'Y' ).listen().hide();
const ecefZCtrl = coordFolder.add( navParams, 'ecefZ' ).name( 'Z' ).listen().hide();
const ecefRadiusCtrl = coordFolder.add( navParams, 'ecefRadius' ).name( 'Radius (m)' ).listen().hide();

function updateCoordVisibility() {

	if ( navParams.coordMode === 'Lat / Lon / Alt' ) {

		latCtrl.show();
		lonCtrl.show();
		altCtrl.show();
		ecefXCtrl.hide();
		ecefYCtrl.hide();
		ecefZCtrl.hide();
		ecefRadiusCtrl.hide();

	} else {

		latCtrl.hide();
		lonCtrl.hide();
		altCtrl.hide();
		ecefXCtrl.show();
		ecefYCtrl.show();
		ecefZCtrl.show();
		ecefRadiusCtrl.show();

	}

}

coordModeCtrl.onChange( ( val: string ) => {

	if ( val === 'Lat / Lon / Alt' ) {

		const [ lat, lon ] = ecefToLatLonAlt( navParams.ecefX, navParams.ecefY, navParams.ecefZ );
		navParams.lat = parseFloat( lat.toFixed( 6 ) );
		navParams.lon = parseFloat( lon.toFixed( 6 ) );
		navParams.alt = navParams.ecefRadius;

	} else {

		const [ x, y, z ] = latLonAltToEcef( navParams.lat, navParams.lon, 0 );
		navParams.ecefX = parseFloat( x.toFixed( 2 ) );
		navParams.ecefY = parseFloat( y.toFixed( 2 ) );
		navParams.ecefZ = parseFloat( z.toFixed( 2 ) );
		navParams.ecefRadius = navParams.alt;

	}

	updateCoordVisibility();

} );

coordFolder.add( {
	jumpTo() {

		let centerX, centerY, centerZ, radius;

		if ( navParams.coordMode === 'Lat / Lon / Alt' ) {

			const alt = navParams.alt || 300;
			[ centerX, centerY, centerZ ] = latLonAltToEcef( navParams.lat, navParams.lon, 0 );
			radius = alt;

		} else {

			centerX = navParams.ecefX;
			centerY = navParams.ecefY;
			centerZ = navParams.ecefZ;
			radius = navParams.ecefRadius || 300;

		}

		camera.center = new Vector3( centerX, centerY, centerZ );
		camera.radius = radius;

	}
}, 'jumpTo' ).name( 'Jump To' );

const controlsFolder = navFolder.addFolder( 'Map Controls' );
controlsFolder.close();
const controlsInfo = { pan: 'Left-click + drag', rotate: 'Right-click + drag', zoom: 'Scroll wheel' };
controlsFolder.add( controlsInfo, 'pan' ).name( 'Pan' ).disable();
controlsFolder.add( controlsInfo, 'rotate' ).name( 'Rotate' ).disable();
controlsFolder.add( controlsInfo, 'zoom' ).name( 'Zoom' ).disable();

// --- Credits & Info ---
const infoFolder = gui.addFolder( 'Credits & Info' );
infoFolder.close();
const infoEl = document.createElement( 'div' );
infoEl.style.cssText = 'padding: 6px 8px; font-size: 11px; line-height: 1.6; color: #eee;';
infoEl.innerHTML = `Example using <a href="https://cloud.google.com/blog/products/maps-platform/create-immersive-3d-map-experiences-photorealistic-3d-tiles" target="_blank" style="color:#a2db3c">Google&#39;s Photorealistic 3D Tiles</a> &amp; <a href="https://ion.cesium.com/" target="_blank" style="color:#a2db3c">Cesium Ion</a>, Built directly off of the <a href="https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/example/babylonjs/googleMapsAerial.js" target="_blank" style="color:#a2db3c">GoogleMapsAerial</a> example in the NASA-AMMOS/3DTilesRendererJS repo<br/><br/>Google Cloud or Cesium Ion API token required`;
infoFolder.$children.appendChild( infoEl );
