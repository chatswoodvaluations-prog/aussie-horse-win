# Oracle Cloud — Exact Step by Step
### Based on the actual buttons you see in 2026

---

## After logging in at cloud.oracle.com

You land on a page that says **"Oracle Cloud Infrastructure"** with a dashboard.

---

## PART A — Create the server

### 1. Open the menu
- Look for **three horizontal lines ≡** in the very top-left corner
- Click it — a sidebar slides out

### 2. Find "Compute"
- In the sidebar, scroll down until you see **"Compute"**
- Hover over it — a submenu appears
- Click **"Instances"**

### 3. Create the instance
- You'll see a table (probably empty)
- Click the blue button that says **"Create instance"**

---

### 4. Name your server
- At the top there's a field with a random name like `instance-20260809-1234`
- Clear it and type: `aussie-horse-win`

---

### 5. Choose Ubuntu (the operating system)

Look for a section called **"Image and shape"**

- Click the **"Edit"** link or button on that section to expand it
- You'll see a box showing the current image (probably "Oracle Linux")
- Click the button that says **"Change image"**
- A panel slides in. Look for tabs or a list — click **"Ubuntu"**
- Select **"Canonical Ubuntu"** → version **22.04**
- The one you want has "Minimal" or just "22.04" in the name — either is fine
- Click the blue **"Select image"** button at the bottom

---

### 6. Choose the free server size (shape)

Still in the "Image and shape" section:

- Click the button that says **"Change shape"**
- A panel slides in with different options
- Look for a tab or section called **"Ampere"** — click it
- You'll see **"VM.Standard.A1.Flex"** — select it (click the radio button or row)
- Below that, sliders appear for **OCPUs** and **Memory**
  - Drag OCPUs to **2**
  - Memory will adjust automatically — set it to **12 GB**
  - *(These are "Always Free" — no charge. Look for the "Always Free-eligible" badge next to them)*
- Click **"Select shape"**

---

### 7. Networking — leave it alone

There's a section called **"Networking"** or **"Primary VNIC information"**

- Don't change anything here
- Just make sure it says **"Assign a public IPv4 address"** and it's selected ✅

---

### 8. Download your login key

Look for a section called **"Add SSH keys"**

- Select **"Generate a key pair for me"**
- Click **"Save private key"** — your browser downloads a file called something like `ssh-key-2026-08-09.key`
- ⚠️ Save this file — you'll need it to log in. Put it on your Desktop or Downloads folder.
- Also click **"Save public key"** if it shows — download that too (optional but handy)

---

### 9. Create it

- Scroll to the bottom of the page
- Click the blue **"Create"** button

The page refreshes and shows your instance with the status **"Provisioning"** (orange dot).
Wait 1–2 minutes. It changes to **"Running"** with a green dot.

---

### 10. Note your server's IP address

On the instance detail page, look for:
- **"Public IP address"** — it looks like `140.83.54.123`
- Write this number down — it's your app's address

---

## PART B — Open the web port (so browsers can reach it)

By default Oracle blocks all traffic. You need to open port 80.

### 1. Go to Networking → Virtual Cloud Networks
- Click the **≡ menu** again (top left)
- Hover over **"Networking"**
- Click **"Virtual cloud networks"**

### 2. Click your VCN
- You'll see one VCN listed (created automatically with your instance)
- Click on its name (something like `vcn-2026-08-09-xxxx`)

### 3. Open Security Lists
- On the VCN detail page, look at the left sidebar for **"Security lists"**
  *(or scroll down to find "Resources" → "Security Lists")*
- Click **"Security lists"**
- Click **"Default Security List for vcn-xxxx"**

### 4. Add port 80
- Click the blue button **"Add ingress rules"**
- Fill in exactly:
  - **Source CIDR:** `0.0.0.0/0`
  - **IP Protocol:** TCP
  - **Destination port range:** `80`
- Click **"Add ingress rules"** (the confirm button)

### 5. Add port 443 (for HTTPS later — same process)
- Click **"Add ingress rules"** again
- Same fields, but **Destination port range:** `443`
- Click **"Add ingress rules"**

---

## PART C — Log into your server

### On Windows

1. Press **Windows key**, type **PowerShell**, open it
2. Type this (replace the parts in `< >` with your actual values):

```
ssh -i C:\Users\<YourWindowsUsername>\Downloads\ssh-key-2026-08-09.key ubuntu@<YourServerIPAddress>
```

Example:
```
ssh -i C:\Users\John\Downloads\ssh-key-2026-08-09.key ubuntu@140.83.54.123
```

3. If it asks: **"Are you sure you want to continue connecting (yes/no)?"**  
   Type `yes` and press Enter

4. You should see a prompt like: `ubuntu@aussie-horse-win:~$`  
   You're in! ✅

### On Mac

1. Open **Terminal** (press Cmd+Space, type Terminal)
2. Type (replace parts in `< >`):

```
chmod 400 ~/Downloads/ssh-key-2026-08-09.key
ssh -i ~/Downloads/ssh-key-2026-08-09.key ubuntu@<YourServerIPAddress>
```

---

## PART D — Run the setup (once you have GitHub sorted)

Once you're logged into the server, you'll run:
```
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/aussie-horse-win/main/deploy/setup.sh | bash
```

*(Still waiting on GitHub — do Steps 1–2 from the main guide first, then message me your username)*

---

## Stuck?

Tell me exactly what you see on screen — what words or buttons — and I'll tell you exactly what to click next.
