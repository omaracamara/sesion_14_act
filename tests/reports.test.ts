import { readdir, unlink } from 'node:fs/promises';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { Channel } from '../src/models/channel.model.js';
import { Report } from '../src/models/report.model.js';
import { Session } from '../src/models/session.model.js';
import { User } from '../src/models/user.model.js';
import { reportUploadsDirectory } from '../src/middleware/upload.js';

let mongo: MongoMemoryServer;
let channelId: string;

async function registerAgent(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password: 'StrongPass123!' }).expect(201);
  return agent;
}

async function clearUploadedEvidence() {
  const names = await readdir(reportUploadsDirectory);
  await Promise.all(names.filter((name) => name !== '.gitkeep').map((name) => unlink(`${reportUploadsDirectory}/${name}`)));
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Report.deleteMany({});
  await Session.deleteMany({});
  await User.deleteMany({});
  await Channel.deleteMany({});
  await clearUploadedEvidence();

  const channel = await Channel.create({
    name: 'Report Channel',
    logoUrl: 'https://example.com/logo.png',
    streamUrl: 'https://example.com/stream.m3u8',
    country: 'Mexico',
    categories: ['News'],
    isActive: true
  });
  channelId = channel.id;
});

afterAll(async () => {
  await clearUploadedEvidence();
  await mongoose.disconnect();
  await mongo.stop();
});

test('reports require authentication', async () => {
  await request(app).get('/api/reports').expect(401);
  await request(app).post('/api/reports').expect(401);
});

test('an authenticated user can create and list a report', async () => {
  const agent = await registerAgent('reporter@example.com');

  const created = await agent.post('/api/reports').field({
    channelId,
    reason: 'AUDIO_PROBLEM',
    description: 'The channel has no sound.'
  }).expect(201);

  expect(created.body.report).toEqual(expect.objectContaining({
    channelId,
    reason: 'AUDIO_PROBLEM',
    description: 'The channel has no sound.',
    status: 'OPEN'
  }));

  const listed = await agent.get('/api/reports').expect(200);
  expect(listed.body.reports).toHaveLength(1);
  expect(listed.body.reports[0].channelId).toEqual(expect.objectContaining({ name: 'Report Channel' }));
});

test('an image evidence file is stored and exposed through its URL', async () => {
  const agent = await registerAgent('image@example.com');
  const created = await agent.post('/api/reports').field({
    channelId,
    reason: 'VIDEO_PROBLEM',
    description: 'The image is frozen.'
  }).attach('evidence', Buffer.from('image evidence'), { filename: 'evidence.png', contentType: 'image/png' }).expect(201);

  expect(created.body.report.evidenceUrl).toMatch(/^\/uploads\/reports\/.+\.png$/);
  await request(app).get(created.body.report.evidenceUrl).expect(200);
});

test('reports reject invalid report data and invalid files', async () => {
  const agent = await registerAgent('validation@example.com');
  await agent.post('/api/reports').field({ channelId, reason: 'NOT_A_REASON', description: 'A valid description.' }).expect(400, {
    error: { code: 'INVALID_REPORT_REASON', message: 'Report reason is invalid' }
  });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: '' }).expect(400, {
    error: { code: 'INVALID_REPORT_DESCRIPTION', message: 'Description is required' }
  });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Text evidence is invalid.' })
    .attach('evidence', Buffer.from('not an image'), { filename: 'evidence.txt', contentType: 'text/plain' })
    .expect(400, { error: { code: 'INVALID_EVIDENCE_FILE', message: 'Evidence must be an image file' } });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Large evidence is invalid.' })
    .attach('evidence', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' })
    .expect(400, { error: { code: 'UPLOAD_ERROR', message: 'Evidence image must be 2 MB or smaller' } });
});

test('reports only list the current user reports', async () => {
  const firstUser = await registerAgent('first@example.com');
  const secondUser = await registerAgent('second@example.com');
  await firstUser.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'First report.' }).expect(201);
  await secondUser.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Second report.' }).expect(201);

  const listed = await firstUser.get('/api/reports').expect(200);
  expect(listed.body.reports).toHaveLength(1);
  expect(listed.body.reports[0].description).toBe('First report.');
});
