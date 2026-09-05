//! Guards the migrations that have already shipped.
//!
//! sqlx records a checksum of every migration it applies and refuses to start
//! against a file that has changed since - so editing one, even a comment in
//! one, bricks every installation that already ran it. Anything up to 0011 went
//! out in v0.5.1 and is frozen; new migrations are still free to change until
//! they ship.

use std::path::Path;

/// sha384 of each released migration, as sqlx stores it.
const RELEASED: &[(&str, &str)] = &[
    ("0001_init.sql", "0637a3f5e073aa02e56639727a5d4a092251a0622073d9a2103aea7ab457de0299d4b1c17a6444fb64f74374e137d1ac"),
    ("0002_drop_fts.sql", "34ffb687801e90db50642689de31f1109032908e82b30578153beb5e2d30f4bde170d2359b890c4a44857cd3becfc51b"),
    ("0003_document_id.sql", "b681768f148ad5e430b55fa82f0ccf45898a20e9b869a9f75682068e2b90c68fcc80a769edb755806599e990bd5210c6"),
    ("0004_playlist_sync.sql", "956074a59add58e89eceac4a5cb584e274afa324163c5a9748d4c3fc56b31bee46d45c9c1b39d6e8f21c35de571182b8"),
    ("0005_channel_delete_and_cloud_sync.sql", "8674f152b96fe0e41051ea15d774ffa5b8bf6e2e6d007968db4e31cc66a74efb03607bbcea7167827340b2f5f7cf4e61"),
    ("0006_track_cover_art.sql", "c9fed78e33742f909f1156660f89647f1f10a53fcec79fa7dc46114e802fa4d174d2fbe26bfeb59c14dd9a8d240fe2f7"),
    ("0007_track_published_at.sql", "da2d6f2ec974fa0bcae776f9cc50f46f2bdeccf92bfdcb28d6bc7f75bd5db210a1cba341bda62b7daba0df6bb26bd4af"),
    ("0008_drop_track_cover_art.sql", "f050a07fce33c4f62af21fb4497a54cb7f4ce562ac795224631ed475d2ef6b13647f393cd745a77b7f9c32faa049d6fb"),
    ("0009_sync_engine.sql", "586aeca947d808b7c22ab0b80a2efa5d9f28f3dd561ff32038ae7463f29fb1da9cfbf0af1194619c668d58ae5af79f6e"),
    ("0010_full_sync.sql", "8b96feaabf78a6a45939478341e2dc5a3af27e049725cd006346a86971ed3ecfafa40a4de50f300519a0108798f2649d"),
    ("0011_query_indexes.sql", "10d6c604c5e13584d9dac8d06379b24e4100e18c46e0ee33d39c4c1dd9c7e9d19a30aaa48a3324634ccc1acf4a6e31df"),
];

#[test]
fn released_migrations_are_never_edited() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    for (name, expected) in RELEASED {
        let bytes =
            std::fs::read(dir.join(name)).unwrap_or_else(|err| panic!("{name} is missing: {err}"));
        let actual = <sha2::Sha384 as sha2::Digest>::digest(&bytes);
        assert_eq!(
            format!("{actual:x}"),
            *expected,
            "{name} has been edited. Every database that already ran it stores \
             the old checksum, and sqlx will refuse to open one - write a new \
             migration instead."
        );
    }
}
