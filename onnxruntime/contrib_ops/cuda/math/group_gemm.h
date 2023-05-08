// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

#pragma once

#include "core/providers/cuda/cuda_kernel.h"

namespace onnxruntime {
namespace contrib {
namespace cuda {
template <typename T>
class GroupGemm final : public ::onnxruntime::cuda::CudaKernel {
 public:
  GroupGemm(const OpKernelInfo& info)
      : ::onnxruntime::cuda::CudaKernel(info) {}

  Status ComputeInternal(OpKernelContext* context) const override;
};
}  // namespace cuda
}  // namespace contrib
}  // namespace onnxruntime
