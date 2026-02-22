# Socket.IO Gateway Deployment Playbook

This is some end-to-end instructions on hosting the socket, this is a very detailed version so you should be done in about 30 minutes or so. Also before you start you should DEFINETLY clone the project on your machine, make a repository and post the project in your OWN repository.

**IMPORTANT, before you begin make sure you do this:**

The best route is to host the client side first, simply go to vercel, connect with your Github, choose your repository, and make sure to add each environment variable with the proper value, I think you already have all the variables namings in the .env.example, but if I forgot any here is the full list:

- NEXT_PUBLIC_SUPABASE_URL=xyz
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=xyz
- KLIPY=xyz
- NEXT_PUBLIC_KLIPY_API_KEY=xyz
- NEXT_PUBLIC_WS_URL=http://localhost:3001 / https://socket.xyz.xyz
**(when you work on the platform locally, do 3001, but when hosting the client side, put the  subdomain and your domain)**
- SUPABASE_SERVICE_ROLE_KEY=xxxxx **(that was used for the goodbye page so you don't have to use it) 0/1**
- GOODBYE_RATE_SALT=xyz **(that's just for the goodbye page, you don't actually need that) 1/1**
- NEXT_PUBLIC_SITE_URL=https://xyz.xyz

#

And  to remove this entire goodbye page from the client side, you simply need to delete the ```middleware.ts``` file, delete the entire ```app/api/goodbye``` folder. And replace the ```app/page.tsx``` file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MessageCircle, Users, Shield, Zap } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        router.push("/@me");
      } else {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-bold text-gray-900">
              ChatApp
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/auth?mode=login"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Login
              </Link>
              <Link
                href="/auth?mode=signup"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Connect with anyone,{" "}
            <span className="text-blue-600">anywhere</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            A simple, fast, and secure chat application. Start conversations with friends, create groups, and stay connected.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth?mode=signup"
              className="px-8 py-3 text-lg font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started Free
            </Link>
            <Link
              href="/auth?mode=login"
              className="px-8 py-3 text-lg font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Everything you need to chat
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<MessageCircle className="w-6 h-6" />}
              title="Direct Messages"
              description="Chat one-on-one with friends and contacts"
            />
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Group Chats"
              description="Create groups for team discussions"
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="Real-time"
              description="Instant message delivery with WebSocket"
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Secure"
              description="Your conversations are private and protected"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          Built with Next.js, Supabase, and WebSocket
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

```

and also replace the ```app/me/layout.tsx``` with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen h-screen w-full overflow-hidden bg-gray-50">
      {children}
    </div>
  );
}
```

after that you can also safely delete ```components/NotePager.tsx```, ```components/LeaveGoodbyeNote.tsx``` and ```lib/supabase/admin.ts```.

I have a feeling that you won't check the commits history and think that I forgot about this, just a wild guess tho.

And for the socket you will need to manually create the .env file **after** you cloned the project, with these commands:

```cd ~/YOURREPONAME/websocket-gateway``` and ```touch .env```, to see the .env file you can do ```ls -a``` and to open it use ```nano .env```, and simply paste these variables with the correct value:

- NODE_ENV=production
- PORT=3001
- IP_HASH_SALT=xyz **(choose a random 32-character string, I recommend to generate one using ```openssl rand -hdex 32```)**
- CLIENT_ORIGINS=https://xyz.xyz,https://www.xyz.xyz **(your client domain, exactly like that)**
- SUPABASE_URL=xyz
- SUPABASE_SERVICE_ROLE_KEY=xyz

---

## Target architecture 

**Public:** `https://socket.xyz.xyz` → **Caddy (80/443)**  
**Private:** Caddy → `127.0.0.1:3001` → **Node/Socket.IO app**

In this setup **only 80/443 are public**. Port `3001` stays private.

---

## Prerequisites

- Ubuntu VM on GCE
- A domain you control 
- The repo with websocket-gateway
- SSH access to the VM (done by default)


---

## Step 0/2 — Create a Google Cloud account

###  Sign up

Go to:  https://cloud.google.com

Click Get started for free

Sign in with Google

Add billing (required, but free tier is enough)

---

## Step 1/2 — Create a Virtual Machine

### 1. Open the Google Cloud Console

Go to:  https://console.cloud.google.com

Top-left: Select project → New project

Name it something like: socket-gateway

### 2. Create the VM

In the top search bar, type Compute Engine

Click VM instances

Click Create instance

### 3. VM settings (IMPORTANT)

Use these exact values if unsure:
#
name: 
```bash
socket-vm
```
#
region: 
```bash
any close to you, but I recommend europe
```
#
machine type: 
```bash
e2-micro (cheap & enough for socket)
```
#
### Boot disk

- Click Change

- OS: Ubuntu

- Version: Ubuntu 22.04 LTS

Click Select
#
### Firewall
 Check:

- Allow HTTP traffic

- Allow HTTPS traffic

Click Create
#
Wait around 1 minute

---
## Before proceeding, setup Firewall Rules:

### 1. In the top search bar, type:
```bash
Firewall
```
### 2. Click “Firewall rules” and then click on "Create firewall rule", this first one is for HTTP (80)
#
name
```bash
allow-http
```
#
Direction of traffic
```bash
ingress
```
#
targets
```bash
All instances in the network
```
#
source IPv4 ranges
```bash
0.0.0.0/0
```
#
protocols and ports
- select: Specified protocols and ports
- check TCP
- ports:
```bash
80
```

**Click Crate**

#
### 3. Crate second firewall rule for HTTPS (port 433)

#
name
```bash
allow-https
```
#
Direction of traffic
```bash
ingress
```
#
targets
```bash
All instances in the network
```
#
source IPv4 ranges
```bash
0.0.0.0/0
```
#
protocols and ports
-
- check TCP
- ports:
```bash
443
```

**Click Create**

#

## Step 2/2 — Connect to your VM (SSH)

1. In VM instances

2. Click SSH next to your VM

3. A terminal window opens in your browser

**You are now inside your server.**


---

## Setup 0/3 - Install basic tools on the server

Copy & paste one block at a time.
```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y curl git build-essential
```
### Explanation:

- curl → download tools

- git → get code from GitHub

- build-essential → needed to compile Node modules

---

## Setup 1/3 - Install Node.js (JavaScript runtime)


Node.js is what runs your socket server.
```bash

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
Verify:
```bash

node -v
npm -v
```
If you see any versions then you did good.

---

## Setup 2/3 - Upload your project code

Before uploading the code, as I said in the beginning you should clone from your OWN repository, that's a relatively important detail.
```basj
git clone https://github.com/YOURNAME/YOURREPO.git
cd YOURREPO/websocket-gateway
```
IMPORTANT is to CD into the SOCKET, dont leave the directory on the entire project, normally you would make another repository just for the websocket and one for the client, but that's the way I did and it works perfectly, this is not a high-scale project so you should be good.


---

## Setup 3/3 - Install dependencies & build and Run the socket once

### install all the packages you need:
```bash
npm ci
npm run build
```
btw that ci stands for clean install, it's a better version of simple ```npm i```, both works.

### run the socker once for test
```bash
npm run start
```
If no errors → press CTRL + C to stop it.

---

## Config 0/3  — Keep the server running w PM2

### PM2 keeps your app alive even if:

- SSH closes

- VM restarts

- App crashes

### Install PM2
```bash
sudo npm i -g pm2
```
### Start the socket gateway
```bash
pm2 start npm --name websocket-gateway -- start
```
### Save the process:
```bash
pm2 save
```
### Enable auto-start on reboot
```bash
pm2 startup
```
- PM2 will print a long command starting with sudo env PATH=...
- **Copy-paste and run that exact command** (VERY important)

### Then:
```bash
pm2 save
```
### Check status:
```bash
pm2 status
pm2 logs websocket-gateway
```
---

## Config 1/3  — Buy a domain


### You can use:

- Namecheap

- Google Domains

- Cloudflare

Literally any provider, but Namecheap is the easiest in my opinion.


---

## Config 2/3  — Point domain to your VM


### 1. Get your VM external IP

In Google Cloud:

- VM instances → copy External IP

Example:
```bash
34.xxx.xxx.xxx
```
### 2. Create DNS record

In your domain provider:

- Type: A
- Host: socket
- Value (IP): VM_EXTERNAL_IP

This creates:
```bash
socket.xyz.com
```
Wait a few mins and then test with:
```bash
ping socket.xyz.com
```
---

## Config 3/3  — Install Caddy (for HTTPS)


### 1. Caddy is what:

- handles https  automatically

- encrypts

- and proxies traffic to node
```bash
sudo apt install -y caddy
caddy version
```
### 2. Configure Caddy
**Find the Caddy config file**, caddy's main file lives somewhere here:
```bash
/etc/caddy/Caddyfile
```
Edit it:
```
sudo nano /etc/caddy/Caddyfile
```
Replace everything inside with:
```caddyfile
socket.xyz.xyz {
  reverse_proxy 127.0.0.1:3001
}
```
*Save (```CTRL + O```, Enter, ```CTRL + X```)*

Restart Caddy:
```bash
sudo systemctl restart caddy
```
---

## 0/0 Fix — In case you get “browser loads forever” like I did

### Add a simple HTTP response so browsers don’t hang
Simply go to:
```bash
~/websocket-gateway/src/index.ts
```
Do:
```bash
nano index.ts
```
And look where you find the line:
```ts
// Create HTTP server
const httpServer = createServer()
```
And replace it with:
```ts
// Create HTTP server (respond to normal browser requests so it doesn't "load forever")
const httpServer = createServer((req, res) => {
  const url = req.url || "/"

  // Basic health check + root
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    return res.end("OK")
  }

  // Socket.IO will handle /socket.io/* internally
  // For everything else, return 404 so the browser doesn't hang
  res.writeHead(404, { "Content-Type": "text/plain" })
  res.end("Not Found")
})
```

Rebuild & restart:
```bash
npm run build
pm2 restart websocket-gateway
```
---

## That's it, 


If the client connects, congrats it works, if it doesn't then it is what it is, just be patient.
