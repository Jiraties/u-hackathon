fn compress(a: Field, b: Field, domain: Field) -> Field {
    std::hash::poseidon2_permutation([a, b, domain, 3 * 18446744073709551616])[0]
}
fn fold<let N: u32>(values: [Field; N], domain: Field) -> Field {
    let mut acc = domain;
    for i in 0..N { acc = compress(acc, values[i], domain); }
    acc
}
fn main(
    context: pub [Field; 27], scores: [u32; 3], record_salt: Field, record_version: u32,
    siblings: [Field; 8], leaf_index: u32, total: u32, total_salt: Field,
) {
    // ABI: chain, registry, root, year, round, dataset version, program hi/lo,
    // rule version, policy hash hi/lo, result hi/lo, subject hi/lo, nullifier,
    // blinded total, eligibility, three subject IDs, weights and minima.
    assert(context[0] != 0); assert(context[1] != 0); assert(context[2] != 0);
    assert(context[3] as u32 >= 2020); assert(context[3] as u32 <= 2100);
    assert(context[4] as u32 > 0); assert(context[5] as u32 > 0); assert(context[8] as u32 > 0);
    for i in 6..15 { if i != 8 { assert(context[i] as u128 as Field == context[i]); } }
    assert(record_salt != 0); assert(total_salt != 0); assert(record_version > 0); assert(leaf_index < 256);
    let mut weighted: u64 = 0;
    let mut eligible = true;
    let mut ids = [0; 3];
    for i in 0..3 {
        ids[i] = context[18+i] as u32;
        assert(ids[i] > 0); assert(ids[i] as Field == context[18+i]);
        let weight = context[21+i] as u32; let minimum = context[24+i] as u32;
        assert(weight as Field == context[21+i]); assert(minimum as Field == context[24+i]);
        assert(weight > 0); assert(weight <= 10000); assert(minimum <= 10000); assert(scores[i] <= 10000);
        weighted += (scores[i] as u64) * (weight as u64);
        eligible = eligible & (scores[i] >= minimum);
    }
    assert(ids[0] != ids[1]); assert(ids[0] != ids[2]); assert(ids[1] != ids[2]);
    assert(context[21] + context[22] + context[23] == 10000);
    assert(context[17] == if eligible { 1 } else { 0 });
    assert(total as u64 == (weighted + 5000) / 10000);
    let leaf = fold([context[3], context[4], context[5], context[13], context[14], record_version as Field, record_salt,
        context[18], context[19], context[20], scores[0] as Field, scores[1] as Field, scores[2] as Field], 1001);
    let mut root = leaf;
    for i in 0..8 {
        root = if ((leaf_index >> i) & 1) == 0 { compress(root, siblings[i], 1002) } else { compress(siblings[i], root, 1002) };
    }
    assert(root == context[2]);
    // Result ID is proof-bound but excluded from nullifier to prevent a second
    // result claiming the same record/program/policy. No raw totals are public.
    assert(context[15] == fold([context[0], context[1], context[3], context[4], context[6], context[7],
        context[8], context[9], context[10], leaf], 1003));
    assert(context[16] == fold([total as Field, context[17], total_salt, context[13], context[14],
        context[6], context[7], context[9], context[10], context[11], context[12]], 1004));
    assert((context[11] != 0) | (context[12] != 0));
}
