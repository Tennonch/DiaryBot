function parseExercise(text) {
    const isCardio = /біг|орбітрек|кардіо|доріжк/i.test(text);
    const numbers = text.match(/\d+/g);
    let name = text;
    let sets = null;
    let reps = null;

    if (isCardio && numbers && numbers.length >= 1) {
        sets = parseInt(numbers[0]);
        name = text.split(numbers[0])[0].replace(/[,-\sхxпохвилинминmin]+$/i, '').trim();
    } else if (numbers && numbers.length >= 2) {
        sets = parseInt(numbers[0]);
        reps = parseInt(numbers[1]);
        name = text.split(numbers[0])[0];
    } else if (numbers && numbers.length === 1) {
        sets = parseInt(numbers[0]);
        name = text.split(numbers[0])[0];
    }

    name = name.replace(/[,-\sхxпо]+$/i, '').trim();
    return { name, sets, reps, isCardio };
}

module.exports = { parseExercise };