//! The executable. Everything it does is in the library next to it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fygram_lib::run()
}
