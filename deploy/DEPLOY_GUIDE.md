# Aussie Horse Win — Full Deployment Guide
### Plain-English, Step by Step

---

## What you'll end up with

A permanent server running in Sydney, Australia. Your app will be live at a real web address. 
The TAB live odds will work because the server has an Australian IP address.
Race tips will sync automatically at 6am AEST every day.

**Total time:** About 30 minutes. Costs $0 forever (Oracle's free tier).

---

## What you need to do (3 things)

1. Create a free GitHub account — 3 minutes
2. Create a free Oracle Cloud account — 10 minutes
3. Copy-paste one command into the server terminal — 2 minutes

Everything else is done for you by the setup script.

---

## STEP 1 — Create a free GitHub account

GitHub is just a place to store your code online. It's free, and you need it so the server can download the app.

1. Go to **https://github.com**
2. Click the green **"Sign up"** button (top right)
3. Enter your **email address** → click Continue
4. Create a **password** → click Continue  
5. Choose a **username** (e.g. `johnsmith2024`) → click Continue
6. Solve the quick puzzle → click Continue
7. Check your email for a verification code → type it in
8. On the welcome screen, click **"Skip personalization"** (bottom of page)

✅ You now have a GitHub account. **Write down your username** — you'll need it later.

---

## STEP 2 — Create an empty GitHub repository

A "repository" is just a folder for your code on GitHub.

1. On GitHub, click the **+** button (top right, next to your profile picture)
2. Click **"New repository"**
3. Under "Repository name", type: `aussie-horse-win`
4. Make sure **"Private"** is selected (your picks stay private)
5. **Do NOT tick** "Add a README file" — leave everything else blank
6. Click the green **"Create repository"** button

✅ You'll see an empty repo page. Leave this browser tab open.

---

## STEP 3 — Tell Replit to push the code to your GitHub

This part is done by the developer (me, in Replit). Once you've done Steps 1–2, 
let me know your **GitHub username** and the code will be uploaded automatically.

*(Nothing to do on your end for this step — just message me.)*

---

## STEP 4 — Create a free Oracle Cloud account

Oracle gives you a permanently free server in Sydney. No charges, ever, on the free tier.
You do need a credit card for identity verification (they do NOT charge it).

1. Go to **https://cloud.oracle.com**
2. Click **"Start for free"** (big button in the middle)
3. Fill in your details:
   - Country: **Australia**
   - Name and email address
   - Click **"Verify my email"** → check your inbox → click the link in the email
4. Back on Oracle's site, create a **password** (write it down!)
5. On the next screen, for **"Home Region"** — this is important:
   - Click the dropdown
   - Select **"Australia East (Sydney)"**
   - ⚠️ You can NEVER change this later, so make sure it says Sydney
6. Tick the Terms and Conditions box → Click **"Continue"**
7. Enter your **credit card details** (verification only, no charge)
8. Click **"Start my free trial"**

You'll get an email saying your account is being set up. It usually takes 5–15 minutes.
When you get the "Your account is ready" email, come back and continue.

---

## STEP 5 — Create your free server (VM)

1. Log into **https://cloud.oracle.com**
2. In the top left, click the **☰ hamburger menu** (three lines)
3. Hover over **"Compute"** → click **"Instances"**
4. Click the blue **"Create instance"** button
5. Change the settings as follows:

   **Name:** Type `aussie-horse-win`
   
   **Image and shape:**
   - Click **"Change image"**
   - Select **"Ubuntu"**
   - Make sure it says **Ubuntu 22.04** → click **"Select image"**
   - Click **"Change shape"**
   - Select **"Ampere"** (the ARM option)
   - Set **OCPUs to 2** and **Memory to 12 GB** (both free)
   - Click **"Select shape"**
   
   **Networking:**
   - Leave everything as default (it creates a new network for you)
   - Make sure **"Assign a public IPv4 address"** is ticked ✅
   
   **SSH keys (how you log into the server):**
   - Select **"Generate a key pair for me"**
   - Click **"Save private key"** — this downloads a file called `ssh-key-....key`
   - ⚠️ Save this file somewhere safe on your computer. You need it to log in.

6. Click **"Create"** at the bottom

The server will show "Provisioning" for 1–2 minutes, then change to **"Running"** with a green dot.
When it's Running, note down the **"Public IP address"** shown on the page (looks like `140.83.xx.xx`).

---

## STEP 6 — Open port 80 so the web works

By default Oracle blocks web traffic. You need to open port 80 (the standard web port).

1. On your instance page, scroll down to **"Instance information"** 
2. Under **"Primary VNIC"**, click on the **subnet link** (looks like `subnet-2024...`)
3. On the subnet page, click **"Default Security List"**
4. Click **"Add Ingress Rules"**
5. Fill in:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **TCP**
   - Destination Port Range: `80`
6. Click **"Add Ingress Rules"**
7. Repeat steps 4–6 for port **443** (for HTTPS later)

---

## STEP 7 — Connect to your server (SSH)

This is how you get a terminal on your new server.

**On Windows:**
1. Open the Start menu → search for **"PowerShell"** → open it
2. Find the SSH key file you downloaded (e.g. in your Downloads folder)
3. Right-click the `.key` file → Properties → Security → make sure only your user has access
4. In PowerShell, type this command (replace the bits in < >):
   ```
   ssh -i C:\Users\YourName\Downloads\ssh-key-XXXX.key ubuntu@YOUR_SERVER_IP
   ```
5. If it asks "Are you sure you want to continue connecting?" type `yes` and press Enter

**On Mac:**
1. Open **Terminal** (search for it in Spotlight)
2. Type (replace the bits in < >):
   ```
   chmod 400 ~/Downloads/ssh-key-XXXX.key
   ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@YOUR_SERVER_IP
   ```
3. If it asks "Are you sure you want to continue connecting?" type `yes` and press Enter

You'll see a `ubuntu@aussie-horse-win:~$` prompt. You're in! ✅

---

## STEP 8 — Run the setup script

In the server terminal, paste this one command and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/aussie-horse-win/main/deploy/setup.sh | bash
```

*(Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username)*

The script will ask you a few questions:
- **GitHub username** — your GitHub username
- **GitHub repo name** — `aussie-horse-win`
- **NordVPN SOCKS5 username** — from your NordVPN account
- **NordVPN SOCKS5 password** — from your NordVPN account

Then it runs for about 5 minutes installing everything automatically.

At the end you'll see:
```
✅ Setup complete!
Your app is live at: http://140.83.xx.xx
```

---

## STEP 9 — Open your app

1. Copy the IP address from the end of the setup output
2. Paste it into your browser: `http://140.83.xx.xx`
3. Your Aussie Horse Win app loads — with **real live TAB data!** 🎉

To trigger the first sync manually:
- Go to your app → click the **"Sync"** button
- It will fetch today's real race fields from TAB
- Come back after a minute and your nominations will be populated with real horses

From now on, it syncs automatically every morning at 6:00am AEST.

---

## Bookmark / save to desktop

Once the app is at a real IP address, you can:
- Bookmark it in Chrome
- In Chrome: three dots → **Save and share** → **Create shortcut** → tick "Open as window" → saves to desktop

---

## If something goes wrong

SSH back into the server and run:
```bash
pm2 status          # Is the app running?
pm2 logs ahw-api    # What errors are there?
```

---

## Finding your NordVPN SOCKS5 credentials

1. Log into **https://my.nordaccount.com**
2. Go to **NordVPN** → **Manual setup** → **Dedicated IP** (or SOCKS5)
3. Note the **Service credentials** username and password
   (These are different from your NordVPN login password)

The default AU server used is `au1025.nordvpn.com` — 
you can find other AU servers at **https://nordvpn.com/servers/tools/**
(filter by country = Australia, protocol = SOCKS5)

---

*Guide version: August 2026*
