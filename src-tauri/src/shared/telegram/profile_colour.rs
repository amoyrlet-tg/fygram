use std::collections::HashMap;

use anyhow::{Context, Result};
use grammers_client::{tl, Client};
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

use super::emoji_status::EmojiStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ProfileColour {
    pub(crate) bg: Vec<String>,

    pub(crate) dark_bg: Vec<String>,

    pub(crate) background_emoji: Option<EmojiStatus>,

    pub(crate) pattern: Option<String>,

    pub(crate) text: Option<String>,
}

pub(crate) async fn of_user(
    client: &Client,
    dir: &std::path::Path,
    user: &tl::enums::User,
) -> Option<ProfileColour> {
    if let Some(nft) = super::emoji_status::collectible(user) {
        let mut background_emoji = None;
        if nft.pattern_document_id != 0 {
            match super::emoji_status::fetch(client, dir, nft.pattern_document_id).await {
                Ok(emoji) => background_emoji = Some(emoji),
                Err(err) => crate::log!(
                    "profile colour: collectible pattern {}: {err:#}",
                    nft.pattern_document_id
                ),
            }
        }
        return Some(ProfileColour {
            bg: vec![nft.edge, nft.center],
            dark_bg: Vec::new(),
            background_emoji,
            pattern: Some(nft.pattern),
            text: Some(nft.text),
        });
    }

    let tl::enums::User::User(user) = user else {
        return None;
    };
    let (bg, dark_bg, emoji_id) = match user.profile_color.as_ref()? {
        tl::enums::PeerColor::Color(colour) => {
            let index = colour.color?;
            let palette = match palette(client, index).await {
                Ok(palette) => palette?,
                Err(err) => {
                    crate::log!("profile colour: palette {index} unavailable: {err:#}");
                    return None;
                }
            };
            (palette.bg, palette.dark_bg, colour.background_emoji_id)
        }
        tl::enums::PeerColor::Collectible(colour) => (
            hexes(&colour.colors),
            colour.dark_colors.as_deref().map(hexes).unwrap_or_default(),
            Some(colour.background_emoji_id),
        ),
        tl::enums::PeerColor::InputPeerColorCollectible(_) => return None,
    };

    if bg.is_empty() {
        return None;
    }

    let mut background_emoji = None;
    if let Some(document_id) = emoji_id.filter(|id| *id != 0) {
        match super::emoji_status::fetch(client, dir, document_id).await {
            Ok(emoji) => background_emoji = Some(emoji),
            Err(err) => crate::log!("profile colour: background emoji {document_id}: {err:#}"),
        }
    }

    Some(ProfileColour {
        bg,
        dark_bg,
        background_emoji,
        pattern: None,
        text: None,
    })
}

#[derive(Clone)]
struct Palette {
    bg: Vec<String>,
    dark_bg: Vec<String>,
}

static PALETTES: OnceCell<HashMap<i32, Palette>> = OnceCell::const_new();

async fn palette(client: &Client, index: i32) -> Result<Option<Palette>> {
    let palettes = PALETTES
        .get_or_try_init(|| fetch_palettes(client))
        .await
        .context("asking Telegram for the profile colour palettes")?;
    Ok(palettes.get(&index).cloned())
}

async fn fetch_palettes(client: &Client) -> Result<HashMap<i32, Palette>> {
    let colours = client
        .invoke(&tl::functions::help::GetPeerProfileColors { hash: 0 })
        .await?;
    let tl::enums::help::PeerColors::Colors(colours) = colours else {
        return Ok(HashMap::new());
    };

    let mut out = HashMap::new();
    for option in colours.colors {
        let tl::enums::help::PeerColorOption::Option(option) = option;
        let bg = option.colors.as_ref().map(background).unwrap_or_default();
        if bg.is_empty() {
            continue;
        }
        out.insert(
            option.color_id,
            Palette {
                bg,
                dark_bg: option
                    .dark_colors
                    .as_ref()
                    .map(background)
                    .unwrap_or_default(),
            },
        );
    }
    Ok(out)
}

fn background(set: &tl::enums::help::PeerColorSet) -> Vec<String> {
    match set {
        tl::enums::help::PeerColorSet::PeerColorProfileSet(set) => hexes(&set.bg_colors),
        tl::enums::help::PeerColorSet::Set(_) => Vec::new(),
    }
}

fn hexes(colours: &[i32]) -> Vec<String> {
    colours
        .iter()
        .map(|c| format!("#{:06x}", c & 0x00ff_ffff))
        .collect()
}
