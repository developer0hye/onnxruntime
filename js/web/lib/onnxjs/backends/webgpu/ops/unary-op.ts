// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {AttributeWithCacheKey, createAttributeWithCacheKey} from '../../../attribute-with-cache-key';
import {Graph} from '../../../graph';
import {Tensor} from '../../../tensor';
import {MAX_CLIP, MIN_CLIP} from '../../../util';
import {WebGpuInferenceHandler} from '../inference-handler';
import {GpuDataType, ProgramInfo, ProgramInfoLoader, ProgramMetadata} from '../types';
import {WORKGROUP_SIZE} from './common';

const createElementwiseProgramShader = (funcName: string, funcImpl: string): (datasize: number) => string =>
    (datasize) => {
      const vecSize = Math.ceil(datasize / 4);
      return `
  let WORKGROUP_SIZE: u32 = ${WORKGROUP_SIZE}u;

  @group(0) @binding(0) var<storage, read> inputData : array<vec4<f32>>;
  @group(0) @binding(1) var<storage, write> outputData : array<vec4<f32>>;

  ${funcImpl}

  @stage(compute) @workgroup_size(WORKGROUP_SIZE)
  fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

    // Guard against out-of-bounds work group sizes
    if (global_id.x >= ${vecSize}u) {
      return;
    }

    outputData[global_id.x] = ${funcName}(inputData[global_id.x]);
  }`;
    };

const createElementwiseProgramInfo =
    (metadata: ProgramMetadata, input: Tensor, funcName: string, funcImpl = ''): ProgramInfo => ({
      ...metadata,
      shaderSource: createElementwiseProgramShader(funcName, funcImpl)(input.size),
      outputs: [{dims: input.dims, type: input.type, gpuDataType: GpuDataType.default}],
      dispatchGroup: (inputTensors) =>
          ({x: Math.ceil(inputTensors[0].size / 64 /* workgroup size */ / 4 /* vec size */)})
    });

const createElementwiseProgramInfoLoader =
    (input: Tensor, functionName: string, functionImplementation = '', cacheKey?: string): ProgramInfoLoader => {
      const metadata: ProgramMetadata = {name: functionName, inputTypes: [GpuDataType.default], cacheHint: cacheKey};
      return {
        ...metadata,
        get: () => createElementwiseProgramInfo(metadata, input, functionName, functionImplementation)
      };
    };

export const abs = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'abs'), inputs);

export const acos = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'acos'), inputs);

export const asin = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'asin'), inputs);

export const atan = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'atan'), inputs);

export interface ClipAttributes extends AttributeWithCacheKey {
  readonly min: number;
  readonly max: number;
}

export const clip = async(handler: WebGpuInferenceHandler, inputs: Tensor[], attributes: ClipAttributes):
                        Promise<Tensor[] >=>handler.run(
                            createElementwiseProgramInfoLoader(
                                inputs[0], 'clip', `
    let clip_min_: vec4<f32> = vec4(f32(${attributes.min}));
    let clip_max_: vec4<f32> = vec4(f32(${attributes.max}));

    fn clip(x: vec4<f32>) -> vec4<f32> {
      return clamp(x, clip_min_, clip_max_);
    }`,
                                attributes.cacheKey),
                            inputs);

export const parseClipAttributes = (node: Graph.Node): ClipAttributes => createAttributeWithCacheKey(
    {min: node.attributes.getFloat('min', MIN_CLIP), max: node.attributes.getFloat('max', MAX_CLIP)});

const generateClipAttributesFromInputs = (handler: WebGpuInferenceHandler, inputs: Tensor[]): ClipAttributes => {
  if (inputs.length >= 3 &&
      (!handler.session.isInitializer(inputs[1].dataId) || !handler.session.isInitializer(inputs[2].dataId))) {
    throw new Error('dynamic clip attributes are not allowed');
  }

  const min = (inputs.length >= 3) ? inputs[1].numberData[0] : MIN_CLIP;
  const max = (inputs.length >= 3) ? inputs[2].numberData[0] : MAX_CLIP;
  return createAttributeWithCacheKey({min, max});
};

export const clipV11 = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> => {
  const attributes = generateClipAttributesFromInputs(handler, inputs);
  return clip(handler, [inputs[0]], attributes);
};

export const ceil = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'ceil'), inputs);

export const cos = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'cos'), inputs);

export interface EluAttributes extends AttributeWithCacheKey {
  readonly alpha: number;
}

export const elu = async(handler: WebGpuInferenceHandler, inputs: Tensor[], attributes: EluAttributes):
                       Promise<Tensor[] >=>handler.run(
                           createElementwiseProgramInfoLoader(
                               inputs[0], 'elu', `
    let elu_alpha_: f32 = f32(${attributes.alpha});

    fn elu_(a: f32) -> f32 {
      return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
    }

    fn elu(v: vec4<f32>) -> vec4<f32> {
      return vec4(elu_(v.x), elu_(v.y), elu_(v.z), elu_(v.w));
    }`,
                               attributes.cacheKey),
                           inputs);

export const parseEluAttributes = (node: Graph.Node): EluAttributes =>
    createAttributeWithCacheKey({alpha: node.attributes.getFloat('alpha', 1.0)});

export const exp = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'exp'), inputs);

export const floor = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'floor'), inputs);

export interface LeakyReluAttributes extends AttributeWithCacheKey {
  readonly alpha: number;
}

export const leakyRelu = async(handler: WebGpuInferenceHandler, inputs: Tensor[], attributes: EluAttributes):
                             Promise<Tensor[] >=>handler.run(
                                 createElementwiseProgramInfoLoader(
                                     inputs[0], 'leaky_relu', `
    let leaky_relu_alpha_: f32 = f32(${attributes.alpha});

    fn leaky_relu_(a: f32) -> f32 {
      return select(a, a * leaky_relu_alpha_, a < 0.0);
    }

    fn leaky_relu(v: vec4<f32>) -> vec4<f32> {
      return vec4(leaky_relu_(v.x), leaky_relu_(v.y), leaky_relu_(v.z), leaky_relu_(v.w));
    }`,
                                     attributes.cacheKey),
                                 inputs);

export const parseLeakyReluAttributes = (node: Graph.Node): LeakyReluAttributes =>
    createAttributeWithCacheKey({alpha: node.attributes.getFloat('alpha', 0.01)});

export const log = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'log'), inputs);

// export const neg = (handler: WebGLInferenceHandler, inputs: Tensor[]):
//     Tensor[] => [handler.run(createElementwiseProgramInfoLoader(handler, inputs[0], glslNeg()), inputs)];

// export const not = (handler: WebGLInferenceHandler, inputs: Tensor[]):
//     Tensor[] => [handler.run(createElementwiseProgramInfoLoader(handler, inputs[0], glslNot()), inputs)];

export const relu = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[] >=>handler.run(
    createElementwiseProgramInfoLoader(inputs[0], 'relu', `
    let relu_zero_: vec4<f32> = vec4(0.0, 0.0, 0.0, 0.0);

    fn relu(v: vec4<f32>) -> vec4<f32> {
      return max( v, relu_zero_ );
    }`),
    inputs);

export const sigmoid = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[] >=>handler.run(
    createElementwiseProgramInfoLoader(inputs[0], 'sigmoid', `
    let sigmoid_one_: vec4<f32> = vec4(1.0, 1.0, 1.0, 1.0);

    fn sigmoid(v: vec4<f32>) -> vec4<f32> {
      return sigmoid_one_ / (sigmoid_one_ + exp(-v));
    }`),
    inputs);

export const sin = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'sin'), inputs);

export const sqrt = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'sqrt'), inputs);

export const tan = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'tan'), inputs);

export const tanh = async(handler: WebGpuInferenceHandler, inputs: Tensor[]): Promise<Tensor[]> =>
    handler.run(createElementwiseProgramInfoLoader(inputs[0], 'tanh'), inputs);