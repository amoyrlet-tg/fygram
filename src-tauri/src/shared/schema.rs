use std::collections::HashSet;

use anyhow::{Context, Result};
use sqlx::{Row, SqlitePool};

const SCHEMA: &str = include_str!("../../schema.sql");

const TABLE_PREFIX: &str = "CREATE TABLE IF NOT EXISTS ";

const CONSTRAINTS: &[&str] = &["PRIMARY", "UNIQUE", "FOREIGN", "CHECK", "CONSTRAINT"];

pub(crate) async fn ensure(pool: &SqlitePool) -> Result<()> {
    let mut creates = Vec::new();
    let mut rest = Vec::new();
    for statement in statements(SCHEMA) {
        match table(&statement) {
            Some(table) => creates.push((statement, table)),
            None => rest.push(statement),
        }
    }

    for (statement, _) in &creates {
        run(pool, statement).await?;
    }
    for (_, table) in &creates {
        add_missing_columns(pool, table).await?;
    }
    for statement in &rest {
        run(pool, statement).await?;
    }

    Ok(())
}

async fn run(pool: &SqlitePool, statement: &str) -> Result<()> {
    sqlx::query(statement)
        .execute(pool)
        .await
        .with_context(|| format!("applying schema: {}", opening(statement)))?;
    Ok(())
}

struct Table {
    name: String,
    columns: Vec<Column>,
}

struct Column {
    name: String,
    definition: String,
}

async fn add_missing_columns(pool: &SqlitePool, table: &Table) -> Result<()> {
    let existing = existing_columns(pool, &table.name).await?;

    for column in &table.columns {
        if existing.contains(&column.name) {
            continue;
        }
        sqlx::query(&format!(
            "ALTER TABLE \"{}\" ADD COLUMN {}",
            table.name, column.definition
        ))
        .execute(pool)
        .await
        .with_context(|| format!("adding {}.{}", table.name, column.name))?;
        crate::log!("schema: added {}.{}", table.name, column.name);
    }

    Ok(())
}

async fn existing_columns(pool: &SqlitePool, table: &str) -> Result<HashSet<String>> {
    let rows = sqlx::query(&format!("PRAGMA table_info(\"{table}\")"))
        .fetch_all(pool)
        .await
        .with_context(|| format!("reading the columns of {table}"))?;
    Ok(rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect())
}

fn statements(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_string = false;

    while let Some(ch) = chars.next() {
        if in_string {
            current.push(ch);
            in_string = ch != '\'';
            continue;
        }
        match ch {
            '\'' => {
                in_string = true;
                current.push(ch);
            }
            '-' if chars.peek() == Some(&'-') => {
                for skipped in chars.by_ref() {
                    if skipped == '\n' {
                        break;
                    }
                }
                current.push('\n');
            }
            ';' => {
                push_statement(&mut out, &mut current);
            }
            _ => current.push(ch),
        }
    }
    push_statement(&mut out, &mut current);

    out
}

fn push_statement(out: &mut Vec<String>, current: &mut String) {
    let statement = current.trim();
    if !statement.is_empty() {
        out.push(statement.to_string());
    }
    current.clear();
}

fn table(statement: &str) -> Option<Table> {
    if !statement
        .to_ascii_uppercase()
        .starts_with(&TABLE_PREFIX.to_ascii_uppercase())
    {
        return None;
    }
    let rest = &statement[TABLE_PREFIX.len()..];
    let open = rest.find('(')?;
    let close = rest.rfind(')')?;

    Some(Table {
        name: rest[..open].trim().trim_matches('"').to_string(),
        columns: entries(&rest[open + 1..close])
            .into_iter()
            .filter_map(|entry| column(&entry))
            .collect(),
    })
}

fn entries(body: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let mut in_string = false;

    for ch in body.chars() {
        if in_string {
            current.push(ch);
            in_string = ch != '\'';
            continue;
        }
        match ch {
            '\'' => {
                in_string = true;
                current.push(ch);
            }
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => push_statement(&mut out, &mut current),
            _ => current.push(ch),
        }
    }
    push_statement(&mut out, &mut current);

    out
}

fn column(entry: &str) -> Option<Column> {
    let name = entry
        .split(|ch: char| ch.is_whitespace() || ch == '(')
        .find(|token| !token.is_empty())?;
    if CONSTRAINTS.contains(&name.to_ascii_uppercase().as_str()) {
        return None;
    }
    Some(Column {
        name: name.trim_matches('"').to_string(),
        definition: entry.split_whitespace().collect::<Vec<_>>().join(" "),
    })
}

fn opening(statement: &str) -> String {
    statement
        .split_whitespace()
        .take(5)
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap()
    }

    async fn columns_of(pool: &SqlitePool, table: &str) -> HashSet<String> {
        existing_columns(pool, table).await.unwrap()
    }

    #[tokio::test]
    async fn a_new_database_gets_the_whole_schema() {
        let pool = pool().await;
        ensure(&pool).await.unwrap();

        let tracks = columns_of(&pool, "tracks").await;
        assert!(tracks.contains("forwarded_from"));
        assert!(tracks.contains("published_at"));
        assert!(
            !tracks.contains("cover_path"),
            "dropped before 0.6.0 shipped"
        );

        let channels = columns_of(&pool, "channels").await;
        assert!(channels.contains("can_repost"));
        assert!(channels.contains("last_full_synced_at"));

        assert!(!columns_of(&pool, "sync_outbox").await.is_empty());
    }

    #[tokio::test]
    async fn applying_it_twice_changes_nothing() {
        let pool = pool().await;
        ensure(&pool).await.unwrap();
        let before = columns_of(&pool, "tracks").await;

        ensure(&pool).await.unwrap();

        assert_eq!(columns_of(&pool, "tracks").await, before);
    }

    #[tokio::test]
    async fn an_older_database_gains_the_columns_it_is_missing() {
        let pool = pool().await;
        sqlx::query(
            "CREATE TABLE tracks (
                 id              TEXT PRIMARY KEY,
                 channel_id      TEXT NOT NULL,
                 tg_message_id   INTEGER NOT NULL,
                 file_path       TEXT NOT NULL,
                 file_hash       TEXT NOT NULL,
                 title           TEXT,
                 artist          TEXT,
                 album           TEXT,
                 duration_sec    INTEGER,
                 added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 play_count      INTEGER NOT NULL DEFAULT 0,
                 UNIQUE(channel_id, tg_message_id)
             )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tracks (id, channel_id, tg_message_id, file_path, file_hash, title) \
             VALUES ('t', 'c', 1, '/p', 'h', 'kept')",
        )
        .execute(&pool)
        .await
        .unwrap();

        ensure(&pool).await.unwrap();

        let tracks = columns_of(&pool, "tracks").await;
        for added in [
            "tg_document_id",
            "published_at",
            "forwarded",
            "forwarded_from",
            "forwarded_at",
        ] {
            assert!(tracks.contains(added), "{added} was not added");
        }
        let title: (String,) = sqlx::query_as("SELECT title FROM tracks WHERE id = 't'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(title.0, "kept", "the rows that were already there survive");
    }

    #[test]
    fn table_constraints_are_not_read_as_columns() {
        let parsed = table(
            "CREATE TABLE IF NOT EXISTS t (\n  a TEXT,\n  b INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(a, b),\n  PRIMARY KEY (a)\n)",
        )
        .unwrap();
        let names: Vec<_> = parsed.columns.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["a", "b"]);
        assert_eq!(parsed.columns[1].definition, "b INTEGER NOT NULL DEFAULT 0");
    }

    #[test]
    fn comments_and_literals_do_not_confuse_the_scanner() {
        let parsed = statements(
            "-- a leading note\nCREATE TABLE a (x TEXT DEFAULT 'a;b -- not a comment'); -- trailing\nCREATE INDEX i ON a(x);",
        );
        assert_eq!(parsed.len(), 2);
        assert!(parsed[0].contains("'a;b -- not a comment'"));
        assert!(parsed[1].starts_with("CREATE INDEX"));
    }
}
