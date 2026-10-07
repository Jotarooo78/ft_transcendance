import { test, expect } from '@playwright/test';

export async function createAccount(page, prefix) {
  const name=`${prefix}_${Date.now().toString(36)}`;
  const user={username:name,email:`${name}@example.test`,password:'MusicTestOnly_123!'};
  await page.goto('/');
  await page.getByLabel('Username',{exact:true}).fill(user.username);
  await page.getByLabel('Display name',{exact:true}).fill('Music Browser');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByLabel('Confirm password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Account created',exact:true})).toBeVisible();
  await login(page,user);
  return user;
}

export async function login(page,user) {
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
}

test('catalog: real lists, filters, detail, cancellation and controlled failures',async({page})=>{
  await createAccount(page,'catalog');
  const firstResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/catalog/tracks' && r.status()===200);
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  const initial=await (await firstResponse).json();
  expect(initial.total).toBe(3);
  const cards=page.locator('.catalog-track');
  await expect(cards).toHaveCount(2);
  for (const track of initial.items) await expect(cards.getByRole('heading',{name:track.title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(cards.getByRole('heading',{name:'Clair — demo',exact:true})).toBeVisible();
  for (const sort of ['artist','duration','title']) {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/catalog/tracks' && new URL(r.url()).searchParams.get('sort')===sort && r.status()===200);
    await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption(sort);
    const data=await (await response).json(); expect(data.page).toBe(1);
    await expect(cards.getByRole('heading',{name:data.items[0].title,exact:true})).toBeVisible();
  }
  await page.getByRole('combobox',{name:'Genre',exact:true}).selectOption('Demo');
  await expect(page.getByText('3 track(s) found',{exact:true})).toBeVisible();
  const search=page.getByLabel('Search by title, artist, album or genre');
  await search.fill('introuvable');
  await expect(page.getByText('No tracks match your search.',{exact:true})).toBeVisible();
  await search.fill('aUbE');
  await expect(cards).toHaveCount(1);
  const detailButton=page.getByRole('button',{name:'Details for Aube — demo',exact:true});
  await detailButton.focus();
  const detailResponse=page.waitForResponse(r=>r.url().endsWith('/api/catalog/tracks/20000000-0000-4000-8000-000000000001')&&r.status()===200);
  await page.keyboard.press('Enter');
  expect((await (await detailResponse).json()).durationMs).toBe(6000);
  const panel=page.getByRole('region',{name:'Track details',exact:true});
  await expect(panel.getByText('6 seconds',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible(); await expect(detailButton).toBeFocused();

  // Only failure responses are simulated. Recovery always reaches the real server.
  const detailPattern='**/api/catalog/tracks/20000000-0000-4000-8000-000000000001';
  await page.route(detailPattern,route=>route.fulfill({status:404,contentType:'application/json',body:'{"error":"track_not_found"}'}));
  await detailButton.click();
  await expect(panel.getByText('This track is no longer available.',{exact:true})).toBeVisible();
  await expect(cards).toHaveCount(1); await expect(search).toHaveValue('aUbE');
  await page.unroute(detailPattern);
  await panel.getByRole('button',{name:'Retry detail',exact:true}).click();
  await expect(panel.getByText('6 seconds',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Close details',exact:true}).click();

  // Hold a real old response while a newer search completes.
  let release, started, finished;
  const gate=new Promise(resolve=>{release=resolve;});
  const arrived=new Promise(resolve=>{started=resolve;});
  const completed=new Promise(resolve=>{finished=resolve;});
  const lists='**/api/catalog/tracks?**';
  await page.route(lists,async route=>{
    if(new URL(route.request().url()).searchParams.get('q')!=='Aube'){await route.continue();return;}
    const response=await route.fetch(); started(); await gate;
    try {await route.fulfill({response});} catch { /* superseded request was aborted */ }
    finally {finished();}
  });
  await search.fill('Aube'); await arrived;
  await search.fill('Brise');
  await expect(cards.getByRole('heading',{name:'Brise — demo',exact:true})).toBeVisible();
  release(); await completed;
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading',{name:'Brise — demo',exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.route(lists,route=>route.abort());
  await search.fill('Clair');
  await expect(page.getByRole('button',{name:'Retry catalogue',exact:true})).toBeVisible();
  await page.unroute(lists);
  await page.getByRole('button',{name:'Retry catalogue',exact:true}).click();
  await expect(cards.getByRole('heading',{name:'Clair — demo',exact:true})).toBeVisible();
});
