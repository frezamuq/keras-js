/* global Vue */
import './mnist-cnn.css'

import debounce from 'lodash/debounce'
import range from 'lodash/range'
import * as utils from '../utils'

const MODEL_FILEPATHS_DEV = {
  model: '/demos/data/mnist_cnn/mnist_cnn.json',
  weights: '/demos/data/mnist_cnn/mnist_cnn_weights.buf',
  metadata: '/demos/data/mnist_cnn/mnist_cnn_metadata.json'
}
const MODEL_FILEPATHS_PROD = {
  model: 'demos/data/mnist_cnn/mnist_cnn.json',
  weights: 'https://transcranial.github.io/keras-js-demos-data/mnist_cnn/mnist_cnn_weights.buf',
  metadata: 'demos/data/mnist_cnn/mnist_cnn_metadata.json'
}
const MODEL_CONFIG = {
  filepaths: (process.env.NODE_ENV === 'production') ? MODEL_FILEPATHS_PROD : MODEL_FILEPATHS_DEV
}

const LAYER_DISPLAY_CONFIG = {
  'convolution2d_1': {
    heading: '32 3x3 filters, border mode valid, 1x1 strides',
    scalingFactor: 2
  },
  'activation_1': {
    heading: 'ReLU',
    scalingFactor: 2
  },
  'convolution2d_2': {
    heading: '32 3x3 filters, border mode valid, 1x1 strides',
    scalingFactor: 2
  },
  'activation_2': {
    heading: 'ReLU',
    scalingFactor: 2
  },
  'maxpooling2d_1': {
    heading: '2x2 pools, 1x1 strides',
    scalingFactor: 2
  },
  'dropout_1': {
    heading: 'p=0.25 (only active during training phase)',
    scalingFactor: 2
  },
  'flatten_1': {
    heading: '',
    scalingFactor: 2
  },
  'dense_1': {
    heading: 'output dimensionality 128',
    scalingFactor: 4
  },
  'activation_3': {
    heading: 'ReLU',
    scalingFactor: 4
  },
  'dropout_2': {
    heading: 'p=0.5 (only active during training phase)',
    scalingFactor: 4
  },
  'dense_2': {
    heading: 'output dimensionality 10',
    scalingFactor: 8
  },
  'activation_4': {
    heading: 'Softmax',
    scalingFactor: 8
  }
}

/**
 *
 * VUE COMPONENT
 *
 */
export const MnistCnn = Vue.extend({
  props: ['hasWebgl'],

  template: require('raw-loader!./mnist-cnn.template.html'),

  data: function () {
    return {
      showInfoPanel: true,
      useGpu: this.hasWebgl,
      model: new KerasJS.Model(Object.assign({ gpu: this.hasWebgl }, MODEL_CONFIG)),
      modelLoading: true,
      input: new Float32Array(784),
      output: new Float32Array(10),
      outputClasses: range(10),
      layerResultImages: [],
      layerDisplayConfig: LAYER_DISPLAY_CONFIG,
      drawing: false,
      strokes: []
    }
  },

  computed: {
    loadingProgress: function () {
      return this.model.getLoadingProgress()
    },
    predictedClass: function () {
      if (this.output.reduce((a, b) => a + b, 0) === 0) {
        return -1
      }
      return this.output.reduce((argmax, n, i) => n > this.output[argmax] ? i : argmax, 0)
    }
  },

  ready: function () {
    this.model.ready().then(() => {
      this.modelLoading = false
      this.$nextTick(function () {
        this.getIntermediateResults()
      })
    })
  },

  methods: {

    closeInfoPanel: function () {
      this.showInfoPanel = false
    },

    toggleGpu: function () {
      this.model.toggleGpu(!this.useGpu)
    },

    clear: function (e) {
      this.clearIntermediateResults()
      const ctx = document.getElementById('input-canvas').getContext('2d')
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      const ctxCenterCrop = document.getElementById('input-canvas-centercrop').getContext('2d')
      ctxCenterCrop.clearRect(0, 0, ctxCenterCrop.canvas.width, ctxCenterCrop.canvas.height)
      const ctxScaled = document.getElementById('input-canvas-scaled').getContext('2d')
      ctxScaled.clearRect(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
      this.output = new Float32Array(10)
      this.drawing = false
      this.strokes = []
    },

    activateDraw: function (e) {
      this.drawing = true
      this.strokes.push([])
      let points = this.strokes[this.strokes.length - 1]
      points.push(utils.getCoordinates(e))
    },

    draw: function (e) {
      if (!this.drawing) return

      const ctx = document.getElementById('input-canvas').getContext('2d')

      ctx.lineWidth = 20
      ctx.lineJoin = ctx.lineCap = 'round'
      ctx.strokeStyle = '#393E46'

      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

      let points = this.strokes[this.strokes.length - 1]
      points.push(utils.getCoordinates(e))

      // draw individual strokes
      for (let s = 0, slen = this.strokes.length; s < slen; s++) {
        points = this.strokes[s]

        let p1 = points[0]
        let p2 = points[1]
        ctx.beginPath()
        ctx.moveTo(...p1)

        // draw points in stroke
        // quadratic bezier curve
        for (let i = 1, len = points.length; i < len; i++) {
          ctx.quadraticCurveTo(...p1, ...utils.getMidpoint(p1, p2))
          p1 = points[i]
          p2 = points[i + 1]
        }
        ctx.lineTo(...p1)
        ctx.stroke()
      }
    },

    deactivateDrawAndPredict: debounce(function () {
      if (!this.drawing) return
      this.drawing = false

      const ctx = document.getElementById('input-canvas').getContext('2d')

      // center crop
      const imageDataCenterCrop = utils.centerCrop(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
      const ctxCenterCrop = document.getElementById('input-canvas-centercrop').getContext('2d')
      ctxCenterCrop.canvas.width = imageDataCenterCrop.width
      ctxCenterCrop.canvas.height = imageDataCenterCrop.height
      ctxCenterCrop.putImageData(imageDataCenterCrop, 0, 0)

      // scaled to 28 x 28
      const ctxScaled = document.getElementById('input-canvas-scaled').getContext('2d')
      ctxScaled.save()
      ctxScaled.scale(28 / ctxCenterCrop.canvas.width, 28 / ctxCenterCrop.canvas.height)
      ctxScaled.clearRect(0, 0, ctxCenterCrop.canvas.width, ctxCenterCrop.canvas.height)
      ctxScaled.drawImage(document.getElementById('input-canvas-centercrop'), 0, 0)
      const imageDataScaled = ctxScaled.getImageData(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
      ctxScaled.restore()

      // process image data for model input
      const { data } = imageDataScaled
      this.input = new Float32Array(784)
      for (let i = 0, len = data.length; i < len; i += 4) {
        this.input[i / 4] = data[i + 3] / 255
      }

      this.model.predict({ input: this.input }).then(outputData => {
        this.output = outputData.output
        this.getIntermediateResults()
      })
    }, 200, { leading: true, trailing: true }),

    getIntermediateResults: function () {
      let results = []
      for (let [name, layer] of this.model.modelLayersMap.entries()) {
        if (name === 'input') continue

        const layerClass = layer.layerClass || ''

        let images = []
        if (layer.result && layer.result.tensor.shape.length === 3) {
          images = utils.unroll3Dtensor(layer.result.tensor)
        } else if (layer.result && layer.result.tensor.shape.length === 2) {
          images = [utils.image2Dtensor(layer.result.tensor)]
        } else if (layer.result && layer.result.tensor.shape.length === 1) {
          images = [utils.image1Dtensor(layer.result.tensor)]
        }
        results.push({
          name,
          layerClass,
          images
        })
      }
      this.layerResultImages = results
      setTimeout(() => {
        this.showIntermediateResults()
      }, 0)
    },

    showIntermediateResults: function () {
      this.layerResultImages.forEach((result, layerNum) => {
        const scalingFactor = this.layerDisplayConfig[result.name].scalingFactor
        result.images.forEach((image, imageNum) => {
          const ctx = document.getElementById(`intermediate-result-${layerNum}-${imageNum}`).getContext('2d')
          ctx.putImageData(image, 0, 0)
          const ctxScaled = document.getElementById(`intermediate-result-${layerNum}-${imageNum}-scaled`).getContext('2d')
          ctxScaled.save()
          ctxScaled.scale(scalingFactor, scalingFactor)
          ctxScaled.clearRect(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
          ctxScaled.drawImage(document.getElementById(`intermediate-result-${layerNum}-${imageNum}`), 0, 0)
          ctxScaled.restore()
        })
      })
    },

    clearIntermediateResults: function () {
      this.layerResultImages.forEach((result, layerNum) => {
        const scalingFactor = this.layerDisplayConfig[result.name].scalingFactor
        result.images.forEach((image, imageNum) => {
          const ctxScaled = document.getElementById(`intermediate-result-${layerNum}-${imageNum}-scaled`).getContext('2d')
          ctxScaled.save()
          ctxScaled.scale(scalingFactor, scalingFactor)
          ctxScaled.clearRect(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
          ctxScaled.restore()
        })
      })
    }
  }
})
