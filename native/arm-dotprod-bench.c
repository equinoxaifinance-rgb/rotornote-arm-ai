#define _POSIX_C_SOURCE 200809L

#include <arm_neon.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define LENGTH 256
#define TRIALS 31
#define ITERATIONS 20000

static volatile int64_t sink;

static uint64_t nanos(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC_RAW, &value);
  return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
}

__attribute__((noinline, optimize("no-tree-vectorize")))
static int32_t scalar_dot(const int8_t *left, const int8_t *right) {
  int32_t total = 0;
  for (size_t index = 0; index < LENGTH; index += 1) total += (int32_t)left[index] * (int32_t)right[index];
  return total;
}

__attribute__((noinline))
static int32_t neon_dotprod(const int8_t *left, const int8_t *right) {
  int32x4_t sum = vdupq_n_s32(0);
  for (size_t index = 0; index < LENGTH; index += 16) {
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
  _Alignas(16) int8_t left[LENGTH];
  _Alignas(16) int8_t right[LENGTH];
  uint32_t state = 0x524f544fU;
  for (size_t index = 0; index < LENGTH; index += 1) {
    state = state * 1664525U + 1013904223U;
    left[index] = (int8_t)((state >> 24) % 127 - 63);
    state = state * 1664525U + 1013904223U;
    right[index] = (int8_t)((state >> 24) % 127 - 63);
  }

  const int32_t scalar_result = scalar_dot(left, right);
  const int32_t neon_result = neon_dotprod(left, right);
  if (scalar_result != neon_result) {
    fprintf(stderr, "correctness failure: scalar=%d neon=%d\n", scalar_result, neon_result);
    return 2;
  }

  double scalar_ns[TRIALS];
  double neon_ns[TRIALS];
  for (size_t trial = 0; trial < TRIALS; trial += 1) {
    uint64_t started;
    uint64_t elapsed;
    if (trial % 2 == 0) {
      started = nanos();
      for (size_t iteration = 0; iteration < ITERATIONS; iteration += 1) sink += scalar_dot(left, right);
      elapsed = nanos() - started;
      scalar_ns[trial] = (double)elapsed / ITERATIONS;
      started = nanos();
      for (size_t iteration = 0; iteration < ITERATIONS; iteration += 1) sink += neon_dotprod(left, right);
      elapsed = nanos() - started;
      neon_ns[trial] = (double)elapsed / ITERATIONS;
    } else {
      started = nanos();
      for (size_t iteration = 0; iteration < ITERATIONS; iteration += 1) sink += neon_dotprod(left, right);
      elapsed = nanos() - started;
      neon_ns[trial] = (double)elapsed / ITERATIONS;
      started = nanos();
      for (size_t iteration = 0; iteration < ITERATIONS; iteration += 1) sink += scalar_dot(left, right);
      elapsed = nanos() - started;
      scalar_ns[trial] = (double)elapsed / ITERATIONS;
    }
  }

  qsort(scalar_ns, TRIALS, sizeof(double), compare_double);
  qsort(neon_ns, TRIALS, sizeof(double), compare_double);
  const double scalar_median = scalar_ns[TRIALS / 2];
  const double neon_median = neon_ns[TRIALS / 2];
  const double speedup = scalar_median / neon_median;
  if (speedup <= 1.0) {
    fprintf(stderr, "Arm dot-product speedup gate failed: %.4f\n", speedup);
    return 3;
  }

  printf("{\"schema\":\"rotornote-arm-dotprod-v1\",\"architecture\":\"aarch64\",\"isa\":\"armv8.2-a+dotprod\",\"kernel\":\"NEON vdotq_s32\",\"length\":%d,\"trials\":%d,\"iterations_per_trial\":%d,\"correctness\":{\"scalar\":%d,\"neon\":%d,\"exact_match\":true},\"median_ns\":{\"scalar\":%.4f,\"neon_dotprod\":%.4f},\"median_speedup\":%.4f}\n",
    LENGTH, TRIALS, ITERATIONS, scalar_result, neon_result, scalar_median, neon_median, speedup);
  return sink == 0x7fffffffffffffffLL ? 4 : 0;
}
