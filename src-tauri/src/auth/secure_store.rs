use keyring::Entry;
use std::error::Error;

const SERVICE_NAME: &str = "github-graph-browser";
const ACCOUNT_NAME: &str = "github-oauth-token";

pub fn save_token(token: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;
    entry.set_password(token)?;
    Ok(())
}

pub fn get_token() -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(Box::new(e)),
    }
}

pub fn delete_token() -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(Box::new(e)),
    }
}
