import {
  OrthographicCamera,
  Scene,
  WebGLRenderTarget,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  CfxTexture,
  ShaderMaterial,
  PlaneBufferGeometry,
  Mesh,
  WebGLRenderer
} from '@citizenfx/three';

interface ScreenshotRequest {
  encoding: 'jpg' | 'png' | 'webp';
  quality: number;
  correlation: string;
  resultURL: string;
  targetURL: string;
  targetField: string;
}

// from https://stackoverflow.com/a/12300351
function dataURItoBlob(dataURI: string) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], {type: mimeString});
}

class ScreenshotUI {
  renderer: WebGLRenderer;
  rtTexture: WebGLRenderTarget;
  sceneRTT: Scene;
  cameraRTT: OrthographicCamera;
  material: ShaderMaterial;
  request?: ScreenshotRequest;

  initialize() {
    window.addEventListener('message', event => {
      this.request = event.data.request;
    });

    window.addEventListener('resize', () => {
      this.resize();
    });

    const cameraRTT = new OrthographicCamera( window.innerWidth / -2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / -2, -10000, 10000 );
    cameraRTT.position.z = 100;

    const sceneRTT = new Scene();

    const rtTexture = new WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: LinearFilter, magFilter: NearestFilter, format: RGBAFormat, type: UnsignedByteType } );
    const gameTexture = new CfxTexture( );
    gameTexture.needsUpdate = true;

    const material = new ShaderMaterial( {

      uniforms: { "tDiffuse": { value: gameTexture } },
      vertexShader: `
			varying vec2 vUv;

			void main() {
				vUv = vec2(uv.x, 1.0-uv.y); // fuck gl uv coords
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
`,
      fragmentShader: `
			varying vec2 vUv;
			uniform sampler2D tDiffuse;

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );
			}
`

    } );

    this.material = material;

    const plane = new PlaneBufferGeometry( window.innerWidth, window.innerHeight );
    const quad = new Mesh( plane, material );
    quad.position.z = -100;
    sceneRTT.add( quad );

    const renderer = new WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.autoClear = false;

    const app = document.getElementById('app');

    if (app) {
      app.appendChild(renderer.domElement);
      app.style.display = 'none';
    }

    this.renderer = renderer;
    this.rtTexture = rtTexture;
    this.sceneRTT = sceneRTT;
    this.cameraRTT = cameraRTT;

    this.animate = this.animate.bind(this);

    requestAnimationFrame(this.animate);
  }

  resize() {
    const cameraRTT = new OrthographicCamera( window.innerWidth / -2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / -2, -10000, 10000 );
    cameraRTT.position.z = 100;

    this.cameraRTT = cameraRTT;

    const sceneRTT = new Scene();

    const plane = new PlaneBufferGeometry( window.innerWidth, window.innerHeight );
    const quad = new Mesh( plane, this.material );
    quad.position.z = -100;
    sceneRTT.add( quad );

    this.sceneRTT = sceneRTT;

    this.rtTexture = new WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: LinearFilter, magFilter: NearestFilter, format: RGBAFormat, type: UnsignedByteType } );

    this.renderer.setSize( window.innerWidth, window.innerHeight );
  }

  animate() {
    requestAnimationFrame(this.animate);

    this.renderer.clear();
    this.renderer.render(this.sceneRTT, this.cameraRTT, this.rtTexture, true);

    if (this.request) {
      const request = this.request;
      this.request = undefined;

      this.handleRequest(request);
    }
  }

  handleRequest(request: ScreenshotRequest) {
    console.log(request);
    // read the screenshot
    const read = new Uint8Array(window.innerWidth * window.innerHeight * 4);
    this.renderer.readRenderTargetPixels(this.rtTexture, 0, 0, window.innerWidth, window.innerHeight, read);

    // create a temporary canvas to compress the image
    const canvas = document.createElement('canvas');
    canvas.style.display = 'inline';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // draw the image on the canvas
    const d = new Uint8ClampedArray(read.buffer);

    const cxt = canvas.getContext('2d');
    cxt?.putImageData(new ImageData(d, window.innerWidth, window.innerHeight), 0, 0);

    // encode the image
    let type = 'image/png';

    switch (request.encoding) {
      case 'jpg':
        type = 'image/jpeg';
        break;
      case 'png':
        type = 'image/png';
        break;
      case 'webp':
        type = 'image/webp';
        break;
    }

    if (!request.quality) {
      request.quality = 0.92;
    }

    // actual encoding
    const imageURL = canvas.toDataURL(type, request.quality);

    const getFormData = () => {
      const formData = new FormData();
      formData.append(request.targetField, dataURItoBlob(imageURL), `screenshot.${request.encoding}`);

      return formData;
    };

    // upload the image somewhere
    fetch(request.targetURL, {
      method: 'POST',
      mode: 'cors',
      body: (request.targetField) ? getFormData() : JSON.stringify({
        data: imageURL,
        id: request.correlation
      })
    })
      .then(response => response.text())
      .then(text => {
        if (request.resultURL) {
          fetch(request.resultURL, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify({
              data: text,
              id: request.correlation
            })
          });
        }
      });
  }
}

const ui = new ScreenshotUI();
ui.initialize();
