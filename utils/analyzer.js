const exerciseDictionary = {
    'жим': ['Грудні', 'Трицепси', 'Передні дельти'],
    'віджиманн': ['Грудні', 'Трицепси', 'Плечі'],
    'присід': ['Квадрицепси', 'Сідниці'],
    'тяг': ['Спина', 'Біцепси'],
    'прес': ['Прес', 'М\'язи кору'],
    'скручуванн': ['Прес'],
    'планк': ['М\'язи кору'],
    'підтягуванн': ['Спина', 'Біцепси'],
    'випад': ['Квадрицепси', 'Сідниці'],
    'біг': ['Кардіо', 'Ікри'],
    'орбітрек': ['Кардіо'],
    'доріжк': ['Кардіо']
};

const majorMuscles = ['Грудні', 'Спина', 'Квадрицепси', 'Сідниці', 'Плечі', 'Прес', 'Біцепси', 'Трицепси'];

function analyzeWorkout(exercises) {
    let workedMuscles = new Set();
    let totalSets = 0;

    exercises.forEach(ex => {
        const nameLower = (ex.name || ex.rawText).toLowerCase();
        totalSets += ex.sets || 1;

        for (const [key, muscles] of Object.entries(exerciseDictionary)) {
            if (nameLower.includes(key)) {
                muscles.forEach(m => workedMuscles.add(m));
            }
        }
    });

    return { muscles: Array.from(workedMuscles), volume: totalSets };
}

function getNextWorkoutRecommendation(trainedMuscles) {
    const untaught = majorMuscles.filter(m => !trainedMuscles.includes(m));
    if (untaught.length === 0 || trainedMuscles.includes('Кардіо') && trainedMuscles.length === 1) {
        return "Сьогодні було чудове кардіо! Наступного разу можна додати силові вправи на верх або низ тіла.";
    }
    if (untaught.length === 0) {
        return "Ти пропрацював усе тіло (Fullbody)! Наступного разу можна зробити легке кардіо або йогу для відновлення.";
    }
    const shuffled = untaught.sort(() => 0.5 - Math.random());
    const suggestions = shuffled.slice(0, 2).join(' та ').toLowerCase();
    return `Наступного разу варто звернути увагу на: <b>${suggestions}</b>.`;
}

function getRecoveryTip(volume) {
    const defaultTips = [
        "💧 Пий достатньо води сьогодні.",
        "🧘‍♀️ Не забудь про легку розтяжку перед сном!",
        "🥩 Для кращого росту м'язів сьогодні варто добре поїсти (особливо білок)."
    ];
    if (volume > 15) return "🔥 Ти зробив величезний об'єм роботи! Обов'язково зроби розтяжку та прийми гарячий душ.";
    return defaultTips[Math.floor(Math.random() * defaultTips.length)];
}

module.exports = { analyzeWorkout, getNextWorkoutRecommendation, getRecoveryTip };