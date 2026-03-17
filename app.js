require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const { parseExercise } = require('./utils/parser');
const { analyzeWorkout, getNextWorkoutRecommendation, getRecoveryTip } = require('./utils/analyzer');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const idleMenu = Markup.keyboard([
    ['🟢 Старт тренування'],
    ['📊 Моя статистика', '🕒 Історія (останні 3)']
]).resize();

const activeMenu = Markup.keyboard([
    ['🔴 Завершити тренування'],
    ['❌ Скасувати поточне']
]).resize();

bot.start(async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.upsert({
        where: { telegramId: telegramId },
        update: {},
        create: { telegramId: telegramId }
    });

    const activeWorkout = await prisma.workout.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });
    const currentMenu = activeWorkout ? activeMenu : idleMenu;

    ctx.reply('Привіт! Я твій розумний щоденник тренувань 🏋️‍♀️\nОбирай дію в меню нижче:', currentMenu);
});

bot.hears('🕒 Історія (останні 3)', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return;

    const history = await prisma.workout.findMany({
        where: { userId: user.id, status: 'FINISHED' },
        orderBy: { endTime: 'desc' },
        take: 3,
        include: { exercises: true }
    });

    if (history.length === 0) return ctx.reply('Ти ще не завершив жодного тренування.');

    let reply = '<b>🕒 Твої останні тренування:</b>\n\n';
    history.forEach((w, i) => {
        const date = w.endTime.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        reply += `<b>${i + 1}. Тренування за ${date}</b>\n`;
        if (w.exercises.length === 0) {
            reply += `  (Немає записів)\n`;
        } else {
            w.exercises.forEach(ex => reply += `  - ${ex.rawText}\n`);
        }
        reply += '\n';
    });
    ctx.replyWithHTML(reply);
});

bot.hears('📊 Моя статистика', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return;

    const workoutsCount = await prisma.workout.count({ where: { userId: user.id, status: 'FINISHED' } });
    const stats = await prisma.exercise.aggregate({
        _sum: { sets: true },
        where: { workout: { userId: user.id, status: 'FINISHED' } }
    });

    const totalVolume = stats._sum.sets || 0;
    ctx.replyWithHTML(
        `<b>📊 Твоя статистика:</b>\n\n🏋️‍♀️ Завершених тренувань: <b>${workoutsCount}</b>\n` +
        `🔄 Загальний об'єм (підходи/хв): <b>${totalVolume}</b>\n\n<i>Ти молодець!</i>`
    );
});

bot.hears('🟢 Старт тренування', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) return;
    const activeWorkout = await prisma.workout.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });
    if (activeWorkout) return ctx.reply('У тебе вже є активне тренування!', activeMenu);

    await prisma.workout.create({ data: { userId: user.id, status: 'ACTIVE' } });

    ctx.reply('Тренування розпочато! 💪\nЧекаю на твої вправи.', activeMenu);
});

bot.hears('🔴 Завершити тренування', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    const activeWorkout = await prisma.workout.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
        include: { exercises: true }
    });

    if (!activeWorkout) return ctx.reply('У тебе зараз немає активного тренування.', idleMenu);

    await prisma.workout.update({
        where: { id: activeWorkout.id },
        data: { status: 'FINISHED', endTime: new Date() }
    });

    if (activeWorkout.exercises.length === 0) {
        return ctx.reply('Тренування завершено порожнім.', idleMenu);
    }

    let report = '<b>🏁 Твоє тренування завершено! Ось твій звіт:</b>\n\n<b>📋 Вправи:</b>\n';
    activeWorkout.exercises.forEach((ex, index) => {
        report += `${index + 1}. ${ex.rawText}\n`;
    });

    const analysis = analyzeWorkout(activeWorkout.exercises);

    report += '\n<b>📊 Аналіз навантаження:</b>\n';
    report += analysis.muscles.length > 0 ? `<b>🎯 Задіяні м'язи:</b> ${analysis.muscles.join(', ')}\n` : `<b>🎯 Тип:</b> Змішане тренування\n`;
    report += `\n<b>💡 Відновлення:</b>\n${getRecoveryTip(analysis.volume)}\n`;
    report += `\n<b>🗓 План на майбутнє:</b>\n${getNextWorkoutRecommendation(analysis.muscles)}`;

    ctx.replyWithHTML(report, idleMenu);
});

bot.hears('❌ Скасувати поточне', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    const activeWorkout = await prisma.workout.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });
    if (!activeWorkout) return ctx.reply('У тебе зараз немає активного тренування.', idleMenu);

    await prisma.exercise.deleteMany({ where: { workoutId: activeWorkout.id } });
    await prisma.workout.delete({ where: { id: activeWorkout.id } });

    ctx.reply('🗑 Поточне тренування успішно скасовано. Дані видалено.', idleMenu);
});

function formatExerciseReply(parsedData) {
    if (parsedData.isCardio) return `✅ Записала: ${parsedData.name} (${parsedData.sets ? parsedData.sets : '?'} хв.)`;
    return `✅ Записала: ${parsedData.name} (${parsedData.sets ? parsedData.sets : '?'} підх. по ${parsedData.reps ? parsedData.reps : '?'} повт.)`;
}

bot.on('text', async (ctx) => {
    const ignoreList = ['🟢 Старт тренування', '🔴 Завершити тренування', '📊 Моя статистика', '🕒 Історія (останні 3)', '❌ Скасувати поточне'];
    if (ignoreList.includes(ctx.message.text)) return;

    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const activeWorkout = await prisma.workout.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });

    if (!activeWorkout) return ctx.reply('Спочатку почни тренування кнопкою "🟢 Старт тренування"! ☝️');

    const parsedData = parseExercise(ctx.message.text);

    await prisma.exercise.create({
        data: {
            workoutId: activeWorkout.id,
            rawText: ctx.message.text,
            name: parsedData.name,
            sets: parsedData.sets,
            reps: parsedData.reps
        }
    });

    ctx.reply(formatExerciseReply(parsedData));
});

bot.on('voice', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const activeWorkout = await prisma.workout.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });

    if (!activeWorkout) return ctx.reply('Спочатку почни тренування кнопкою "🟢 Старт тренування"! ☝️');

    const processingMsg = await ctx.reply('⏳ Слухаю і розшифровую...');

    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const tempFilePath = path.join(__dirname, `${ctx.message.voice.file_id}.ogg`);

        const response = await axios({ url: fileLink.href, responseType: 'stream' });
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-1',
        });

        const recognizedText = transcription.text;
        fs.unlinkSync(tempFilePath);

        const parsedData = parseExercise(recognizedText);

        await prisma.exercise.create({
            data: {
                workoutId: activeWorkout.id,
                rawText: recognizedText,
                name: parsedData.name,
                sets: parsedData.sets,
                reps: parsedData.reps
            }
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
        ctx.reply('🎤 ' + formatExerciseReply(parsedData).replace('✅ ', ''));

    } catch (error) {
        console.error('Помилка обробки голосу:', error);
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => { });

        if (error.status === 429 || (error.error && error.error.type === 'insufficient_quota')) {
            ctx.reply('❌ Помилка: Недостатньо коштів на балансі OpenAI API.');
        } else {
            ctx.reply('Ой, сталася помилка при розпізнаванні голосу.');
        }
    }
});

bot.launch().then(() => console.log('Бот успішно запущений!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));