#define _POSIX_C_SOURCE 200809L

#include <arm_neon.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define MAX_LENGTH 16384
#define TRIALS 31
#define TARGET_MACS_PER_TRIAL 1048576

static volatile int64_t sink;

static uint64_t nanos(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC_RAW, &value);
  return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
}

__attribute__((noinline, optimize("no-tree-vectorize")))
static int32_t scalar_dot(const int8_t *left, const int8_t *right, size_t length) {
  int32_t total = 0;
  for (size_t index = 0; index < length; index += 1) total += (int32_t)left[index] * (int32_t)right[index];
  return total;
}

__attribute__((noinline))
static int32_t neon_dotprod(const int8_t *left, const int8_t *right, size_t length) {
  int32x4_t sum = vdupq_n_s32(0);
  for (size_t index = 0; index < length; index += 16) {
    sum = vdotq_s32(sum, vld1q_s8(left + index), vld1q_s8(right + index));
  }
  return vaddvq_s32(sum);
}

static int compare_double(const void *left, const void *right) {
  const double a = *(const double *)left;
  const double b = *(const double *)right;
  return (a > b) - (a < b);
}

int main(void) {
#if !defined(__aarch64__) || !defined(__ARM_FEATURE_DOTPROD)
#error "RotorNote Arm dot-product evidence requires native aarch64 with Arm dot-product support"
#endif
  static const size_t lengths[] = {16, 64, 256, 1024, 4096, 16384};
  _Alignas(16) int8_t left[MAX_LENGTH];
  _Alignas(16) int8_t right[MAX_LENGTH];
  uint32_t state = 0x524f544fU;
  for (size_t index = 0; index < MAX_LENGTH; index += 1) {
    state = state * 1664525U + 1013904223U;
    left[index] = (int8_t)((state >> 24) % 127 - 63);
    state = state * 1664525U + 1013904223U;
    right[index] = (int8_t)((state >> 24) % 127 - 63);
  }

  printf("{\"schema\":\"rotornote-arm-dotprod-scaling-v2\",\"architecture\":\"aarch64\",\"isa\":\"armv8.2-a+dotprod\",\"kernel\":\"NEON vdotq_s32\",\"measurement\":\"steady-state native kernel only; excludes JS, Wasm dispatch, feature extraction, and model orchestration\",\"trials\":%d,\"points\":[", TRIALS);
  double largest_speedup = 0.0;
  for (size_t point = 0; point < sizeof(lengths) / sizeof(lengths[0]); point += 1) {
    const size_t length = lengths[point];
    const size_t iterations = TARGET_MACS_PER_TRIAL / length < 64 ? 64 : TARGET_MACS_PER_TRIAL / length;
    const int32_t scalar_result = scalar_dot(left, right, length);
    const int32_t neon_result = neon_dotprod(left, right, length);
    if (scalar_result != neon_result) {
      fprintf(stderr, "correctness failure at length %zu: scalar=%d neon=%d\n", length, scalar_result, neon_result);
      return 2;
    }

    double scalar_ns[TRIALS];
    double neon_ns[TRIALS];
    for (size_t trial = 0; trial < TRIALS; trial += 1) {
      uint64_t started;
      uint64_t elapsed;
      if (trial % 2 == 0) {
        started = nanos();
        for (size_t iteration = 0; iteration < iterations; iteration += 1) sink += scalar_dot(left, right, length);
        elapsed = nanos() - started;
        scalar_ns[trial] = (double)elapsed / iterations;
        started = nanos();
        for (size_t iteration = 0; iteration < iterations; iteration += 1) sink += neon_dotprod(left, right, length);
        elapsed = nanos() - started;
        neon_ns[trial] = (double)elapsed / iterations;
      } else {
        started = nanos();
        for (size_t iteration = 0; iteration < iterations; iteration += 1) sink += neon_dotprod(left, right, length);
        elapsed = nanos() - started;
        neon_ns[trial] = (double)elapsed / iterations;
        started = nanos();
        for (size_t iteration = 0; iteration < iterations; iteration += 1) sink += scalar_dot(left, right, length);
        elapsed = nanos() - started;
        scalar_ns[trial] = (double)elapsed / iterations;
      }
    }

    qsort(scalar_ns, TRIALS, sizeof(double), compare_double);
    qsort(neon_ns, TRIALS, sizeof(double), compare_double);
    const double scalar_median = scalar_ns[TRIALS / 2];
    const double neon_median = neon_ns[TRIALS / 2];
    const double speedup = scalar_median / neon_median;
    if (point == sizeof(lengths) / sizeof(lengths[0]) - 1) largest_speedup = speedup;
    printf("%s{\"macs_per_call\":%zu,\"iterations_per_trial\":%zu,\"correctness\":{\"scalar\":%d,\"neon\":%d,\"exact_match\":true},\"median_ns\":{\"scalar\":%.4f,\"neon_dotprod\":%.4f},\"median_ns_per_mac\":{\"scalar\":%.8f,\"neon_dotprod\":%.8f},\"median_speedup\":%.4f}",
      point == 0 ? "" : ",", length, iterations, scalar_result, neon_result, scalar_median, neon_median, scalar_median / length, neon_median / length, speedup);
  }
  printf("],\"compute_bound_gate\":{\"largest_macs_per_call\":%d,\"largest_speedup\":%.4f,\"speedup_above_one\":%s},\"all_exact\":true}\n",
    MAX_LENGTH, largest_speedup, largest_speedup > 1.0 ? "true" : "false");
  if (largest_speedup <= 1.0) {
    fprintf(stderr, "compute-bound Arm dot-product speedup gate failed: %.4f\n", largest_speedup);
    return 3;
  }
  return sink == 0x7fffffffffffffffLL ? 4 : 0;
}
