// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

#pragma once

#include "test/util/include/base_tester.h"

#include "core/graph/constants.h"

namespace onnxruntime {
class InferenceSession;
class Node;
struct SessionOptions;

namespace test {

// To use OpTester:
//  1. Create one with the op name
//  2. Call AddAttribute with any attributes
//  3. Call AddInput for all the inputs
//  4. Call AddOutput with all expected outputs,
//     Or call AddReferenceOutputs to compute reference outputs with the model
//  5. Call Run
//
class OpTester : public BaseTester {
 public:
  // Default to the first opset that ORT was available (7).
  // When operators are updated they need to explicitly add tests for the new opset version.
  // This is due to the kernel matching logic. See KernelRegistry::VerifyKernelDef.
  // Additionally, -1 is supported and defaults to the latest known opset.
  //
  // Defaulting to the latest opset version would result in existing operator implementations for non-CPU EPs to
  // lose their test coverage until an implementation for the new version is added.
  //   e.g. there are CPU and GPU implementations for version 1 of an op. both are tested by a single OpTester test.
  //        opset changes from 1 to 2 and CPU implementation gets added. If 'opset_version' is 2 the kernel matching
  //        will find and run the CPU v2 implementation, but will not match the GPU v1 implementation.
  //        OpTester will say it was successful as at least one EP ran, and the GPU implementation of v1 no longer has
  //        test coverage.
  explicit OpTester(const char* op, int opset_version = 7, const std::string& domain = onnxruntime::kOnnxDomain,
                    bool verify_output = true)
      : BaseTester(op, opset_version, domain, verify_output) {
  }

  // ~OpTester() override;

  // Set whether the NodeArg created by AddInput/AddOutput should include shape information
  // for Tensor types. If not added, shape inferencing should resolve. If added, shape inferencing
  // should validate. Default is to add.
  // Additionally a symbolic dimension will be added if symbolic_dim matches a dimension in the input.
  OpTester& AddShapeToTensorData(bool add_shape = true, int symbolic_dim = -1) {
    SetAddShapeToTensorData(add_shape);
    SetAddSymbolicDimToTensorData(symbolic_dim);
    return *this;
  }

  void AddAttributeProto(ONNX_NAMESPACE::AttributeProto attr) {
    add_attribute_funcs_.emplace_back([attr = std::move(attr)](onnxruntime::Node& node) {
      node.AddAttributeProto(attr);
    });
  }

  template <typename T>
  void AddAttribute(std::string name, T value) {
    // Generate a the proper AddAttribute call for later
    add_attribute_funcs_.emplace_back([name = std::move(name), value = std::move(value)](onnxruntime::Node& node) {
      node.AddAttribute(name, value);
    });
  }

  virtual void AddNodes(onnxruntime::Graph& graph, std::vector<onnxruntime::NodeArg*>& graph_input_defs,
                        std::vector<onnxruntime::NodeArg*>& graph_output_defs,
                        std::vector<std::function<void(onnxruntime::Node& node)>>& add_attribute_funcs);

  using ExpectResult = BaseTester::ExpectResult;

  onnxruntime::Model* GetMutableModel() {
    model_;
  }

 protected:
  // Set test_allow_released_onnx_opset_only_ to false or override this method and return false
  // if inheriting from OpTester to allow testing of a non-released ONNX opset operator
  virtual bool IsAllowReleasedONNXOpsetsOnlySetForThisTest() const {
    return test_allow_released_onnx_opset_only_;
  }

 private:
  void AddInitializers(onnxruntime::Graph& graph);

  std::unique_ptr<onnxruntime::Model> BuildGraph(const std::unordered_map<std::string, int>& extra_domain_to_version,
                                                 const ModelOptions& model_options = ModelOptions{});

  std::vector<std::function<void(onnxruntime::Node& node)>> add_attribute_funcs_;

  // pre-built model to use in Run instead of calling BuildGraph.
  // NOTE: Currently only used in gradient unit tests for builds with training enabled.
  std::unique_ptr<onnxruntime::Model> cached_model_;

  std::vector<std::function<void(onnxruntime::Node& node)>> add_attribute_funcs_;
};

std::vector<std::function<void(onnxruntime::Node& node)>> add_attribute_funcs_;
std::unique_ptr<onnxruntime::Model> model_;

// template <typename TException>
// void ExpectThrow(OpTester& test, const std::string& error_msg) {
//   ORT_TRY {
//     test.Run();
//     // should throw and not reach this
//     EXPECT_TRUE(false) << "Expected Run() to throw";
//   }
//   ORT_CATCH(TException ex) {
//     ORT_UNUSED_PARAMETER(error_msg);
//     ORT_HANDLE_EXCEPTION([&]() {
//       EXPECT_THAT(ex.what(), testing::HasSubstr(error_msg));
//     });
//   }
// }
};

}  // namespace test
}  // namespace onnxruntime
