(module
  (memory (export "memory") 4)

  (func $dot (param $input i32) (param $weights i32) (param $length i32) (result i32)
    (local $index i32)
    (local $left v128)
    (local $right v128)
    (local $sum v128)
    (local.set $sum (v128.const i32x4 0 0 0 0))
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $index) (local.get $length)))
        (local.set $left (v128.load (i32.add (local.get $input) (local.get $index))))
        (local.set $right (v128.load (i32.add (local.get $weights) (local.get $index))))
        (local.set $sum
          (i32x4.add (local.get $sum)
            (i32x4.dot_i16x8_s
              (i16x8.extend_low_i8x16_s (local.get $left))
              (i16x8.extend_low_i8x16_s (local.get $right)))))
        (local.set $sum
          (i32x4.add (local.get $sum)
            (i32x4.dot_i16x8_s
              (i16x8.extend_high_i8x16_s (local.get $left))
              (i16x8.extend_high_i8x16_s (local.get $right)))))
        (local.set $index (i32.add (local.get $index) (i32.const 16)))
        (br $next)))
    (i32.add
      (i32.add (i32x4.extract_lane 0 (local.get $sum)) (i32x4.extract_lane 1 (local.get $sum)))
      (i32.add (i32x4.extract_lane 2 (local.get $sum)) (i32x4.extract_lane 3 (local.get $sum)))))

  (func (export "dense")
    (param $input i32) (param $weights i32) (param $output i32)
    (param $inputCount i32) (param $outputCount i32)
    (local $row i32)
    (local $weightStride i32)
    (local.set $weightStride
      (i32.and (i32.add (local.get $inputCount) (i32.const 15)) (i32.const -16)))
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $row) (local.get $outputCount)))
        (i32.store
          (i32.add (local.get $output) (i32.mul (local.get $row) (i32.const 4)))
          (call $dot
            (local.get $input)
            (i32.add (local.get $weights) (i32.mul (local.get $row) (local.get $weightStride)))
            (local.get $inputCount)))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $next))))
)
