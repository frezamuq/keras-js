import Layer from '../../Layer'
import Tensor from '../../Tensor'
import ops from 'ndarray-ops'

/**
 * _Pooling2D layer class
 */
export default class _Pooling2D extends Layer {
  /**
   * Creates a _Pooling2D layer
   */
  constructor (attrs = {}) {
    super(attrs)
    this.layerClass = '_Pooling2D'

    const {
      poolSize = [2, 2],
      strides = null,
      borderMode = 'valid',
      dimOrdering = 'tf'
    } = attrs

    this.poolSize = poolSize
    this.strides = strides === null ? poolSize : strides
    this.borderMode = borderMode
    this.dimOrdering = dimOrdering

    // default pooling function
    // can be `max` or `average`
    this.poolingFunc = 'max'
  }

  /**
   * Method for computing output dimensions and padding, based on input
   * dimensions, kernel size, and padding mode.
   * For tensorflow implementation of padding, see:
   * https://github.com/tensorflow/tensorflow/blob/master/tensorflow/core/framework/common_shape_fns.cc
   * @param {Tensor} x
   */
  _calcOutputShape (x) {
    const [inputRows, inputCols, inputChannels] = x.tensor.shape
    const [nbRow, nbCol] = this.poolSize

    const outputRows = this.borderMode === 'same'
      ? Math.floor((inputRows + this.strides[0] - 1) / this.strides[0])
      : Math.floor((inputRows - nbRow + this.strides[0]) / this.strides[0])
    const outputCols = this.borderMode === 'same'
      ? Math.floor((inputCols + this.strides[1] - 1) / this.strides[1])
      : Math.floor((inputCols - nbCol + this.strides[1]) / this.strides[1])

    const paddingRow = this.borderMode === 'same'
      ? Math.max(0, Math.floor((outputRows - 1) * this.strides[0] + nbRow - inputRows))
      : 0
    const paddingCol = this.borderMode === 'same'
      ? Math.max(0, Math.floor((outputCols - 1) * this.strides[1] + nbCol - inputCols))
      : 0
    const paddingRowBefore = Math.floor(paddingRow / 2)
    const paddingRowAfter = paddingRow - paddingRowBefore
    const paddingColBefore = Math.floor(paddingCol / 2)
    const paddingColAfter = paddingCol - paddingColBefore

    this.outputShape = [outputRows, outputCols, inputChannels]
    this.inputPadding = [paddingRowBefore, paddingRowAfter, paddingColBefore, paddingColAfter]
  }

  /**
   * Pad input tensor if necessary, for borderMode='same'.
   * See above for notes on calculating padding.
   * For max, we pad with -infinity.
   * For average we pad with zero.
   * @param {Tensor} x
   * @returns {Tensor} x
   */
  _padInput (x) {
    if (this.borderMode === 'same') {
      const [inputRows, inputCols, inputChannels] = x.tensor.shape
      const [paddingRowBefore, paddingRowAfter, paddingColBefore, paddingColAfter] = this.inputPadding
      const newRows = inputRows + paddingRowBefore + paddingRowAfter
      const newCols = inputCols + paddingColBefore + paddingColAfter

      let _x = new Tensor([], [newRows, newCols, inputChannels])
      if (this.poolingFunc === 'max') {
        ops.assigns(_x.tensor, Number.NEGATIVE_INFINITY)
      }

      ops.assign(
        _x.tensor
          .hi(inputRows + paddingRowBefore, inputCols + paddingColBefore, inputChannels)
          .lo(paddingRowBefore, paddingColBefore, 0),
        x.tensor
      )
      x.tensor = _x.tensor
    }
    return x
  }

  /**
   * Method for layer computational logic
   * @param {Tensor} x
   * @returns {Tensor} x
   */
  call (x) {
    if (this.poolingFunc !== 'max' && this.poolingFunc !== 'average') {
      throw new Error(`[pooling._Pooling2D] pooling function must be max or average.`)
    }

    // convert to tf ordering
    if (this.dimOrdering === 'th') {
      x.tensor = x.tensor.transpose(1, 2, 0)
    }

    this._calcOutputShape(x)
    this._padInput(x)

    const [inputRows, inputCols, inputChannels] = x.tensor.shape
    const [nbRow, nbCol] = this.poolSize
    let y = new Tensor([], this.outputShape)
    let patch = new Tensor([], [nbRow, nbCol, inputChannels])

    // keep track of padding since these values are not included in pooling
    // for max, we can ignore since padding values are set to -infinity
    const [paddingRowBefore, paddingRowAfter, paddingColBefore, paddingColAfter] = this.inputPadding

    for (let i = 0, _i = 0; i <= inputRows - nbRow; i += this.strides[0], _i++) {
      let nbRowInPadding = 0
      if (i < paddingRowBefore) {
        nbRowInPadding = paddingRowBefore - i
      } else if ((i + nbRow) > (inputRows - paddingRowAfter)) {
        nbRowInPadding = (i + nbRow) - (inputRows - paddingRowAfter)
      }

      for (let j = 0, _j = 0; j <= inputCols - nbCol; j += this.strides[1], _j++) {
        let nbColInPadding = 0
        if (j < paddingColBefore) {
          nbColInPadding = paddingColBefore - j
        } else if ((j + nbCol) > (inputCols - paddingColAfter)) {
          nbColInPadding = (j + nbCol) - (inputCols - paddingColAfter)
        }

        ops.assign(patch.tensor, x.tensor.hi(i + nbRow, j + nbCol, inputChannels).lo(i, j, 0))
        for (let c = 0; c < inputChannels; c++) {
          if (this.poolingFunc === 'max') {
            y.tensor.set(_i, _j, c, ops.sup(patch.tensor.pick(null, null, c)))
          } else if (this.poolingFunc === 'average') {
            let nbCellsEffective = (nbRow - nbRowInPadding) * (nbCol - nbColInPadding)
            y.tensor.set(_i, _j, c, ops.sum(patch.tensor.pick(null, null, c)) / nbCellsEffective)
          }
        }
      }
    }

    x.tensor = y.tensor

    // convert back to th ordering if necessary
    if (this.dimOrdering === 'th') {
      x.tensor = x.tensor.transpose(2, 0, 1)
    }

    return x
  }
}
