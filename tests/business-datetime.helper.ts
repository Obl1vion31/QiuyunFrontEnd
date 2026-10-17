import assert from 'node:assert/strict';

export async function fillBusinessDateTime(page: any, name: string, value: string) {
  const group = page.locator(`[data-datetime-name="${name}"]:visible`);
  await group.locator('[data-datetime-date]').fill(value.slice(0,10));
  await group.locator('[data-datetime-time]').fill(value.slice(11,16));
  assert.equal(await group.locator('[data-datetime-value]').inputValue(), value.slice(0,16));
}

export async function checkBusinessDateTime(group: any) {
  assert.equal(await group.locator('[data-datetime-date]').getAttribute('type'), 'date');
  assert.equal(await group.locator('[data-datetime-time]').getAttribute('type'), 'time');
  assert.equal(await group.locator('[data-datetime-time]').getAttribute('step'), '60');
  const boxes = await group.locator('[data-datetime-date],[data-datetime-time]').evaluateAll((nodes: HTMLElement[]) => nodes.map(node => {
    const rect=node.getBoundingClientRect(), style=getComputedStyle(node);
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,family:style.fontFamily,size:style.fontSize};
  }));
  assert.equal(boxes.length,2); assert.ok(boxes[0].x<boxes[1].x);
  assert.equal(boxes[0].y,boxes[1].y); assert.equal(boxes[0].width,boxes[1].width);
  assert.ok(boxes.every((box:{height:number;size:string;family:string})=>box.height===40&&box.size==='13px'&&box.family.includes('system-ui')));
}
