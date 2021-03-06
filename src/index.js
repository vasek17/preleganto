// @flow

import type { BuildOptions } from './config';

import path from 'path';
import fs from 'fs';

import yargs from 'yargs';
import moment from  'moment';

import Compiler from './build/compiler';
import Server from './server';
import { log, error, newline, logo } from './logger';

const commands = {
    build: 'Build a preleganto presentation into HTML file',
    serve: 'Serve a preleganto presentation on local server',
    export: 'Export a preleganto presentation into full-featured file in specified format',
};

const options = {
    build: {
        input: {
            alias: 'i',
            required: true,
            description: 'A file with preleganto content',
        },
        output: {
            alias: 'o',
            default: 'slides.html',
            description: 'An output file',
        },
        watch: {
            alias: 'w',
            boolean: true,
            default: false,
            description: 'Watch the source file and rebuild presentation on change',
        }
    },
    serve: {
        input: {
            alias: 'i',
            required: true,
            description: 'A file with preleganto content',
        },
        port: {
            alias: 'p',
            default: 8080
        },
        watch: {
            alias: 'w',
            default: false,
            description: 'Watch the source file, rebuild presentation on change and reload all connected clients'
        }
    },
    export: {
        input: {
            alias: 'i',
            required: true,
            description: 'A file with preleganto content'
        },
        output: {
            alias: 'o',
            default: 'slides.html',
            description: 'An output file',
        },
        format: {
            alias: 'f',
            choices: ['html'],
            default: 'html',
            description: 'Format of the output',
        }
    },
};

async function build(input: string, output: string, options: BuildOptions) {
    const compiler = new Compiler(options);

    let source = '';
    try {
        source = fs.readFileSync(input).toString();
    } catch (ex) {
        error(`I can't find '${input}' :(`);
    }

    const html = await compiler.compile(source);

    try {
        fs.writeFileSync(output, html);
    } catch (ex) {
        error(`I can't manage to write '${output}' :(`);
    }

    return Promise.resolve();
}

async function watch(input: string, output: string, options: BuildOptions, callback: () => void = () => {}) {
    log(`I am watching '${input}' for changes`);
    newline();

    let lastTime = moment();
    fs.watch(input, async function (eventType) {
        if (eventType === 'rename') {
            log(`'${input}' was renamed or deleted wo I will stop watch it`);
            process.exit();
        } else if (eventType === 'change') {
            let time = moment().format('H:mm:ss');

            // listener is triggered twice (empty file, write content)
            if (time !== lastTime) {
                lastTime = time;

                log(`(${time}) '${input}' was changed so I will try to build it again`);
                await build(input, output, options);
                log('And I was successfull');
                callback();
            }
        }
    });

    return Promise.resolve();
}

yargs
    .version()
    .command('build', commands.build, options.build, async function (argv) {
        const options = {
            rootpath: path.join(process.cwd(), path.dirname(argv.input)),
            embed: false
        };

        logo();
        newline();
        log(`I will try to build '${argv.input}'`);

        await build(argv.input, argv.output, options);

        log(`I managed to build '${argv.input}' so I created '${argv.output}'`);
        newline();

        if (argv.watch) {
            await watch(argv.input, argv.output, options);
        }
    })
    .command('serve', commands.serve, options.serve, async function (argv) {
        const options = {
            rootpath: path.join(process.cwd(), path.dirname(argv.input)),
            embed: false
        };

        const tempfile = path.join(options.rootpath, path.basename(argv.input, path.extname(argv.input))) + '.tmp';

        logo();
        newline();
        log(`I will try to build '${argv.input}'`);

        await build(argv.input, tempfile, options);

        log(`I managed to build '${argv.input}'`);
        log('Now I am spawning local server which will serve the presentation');

        const server = new Server({
            port: argv.port
        });

        server.run(tempfile);

        if (argv.watch) {
            await watch(argv.input, tempfile, options, () => server.reloadClients());
        }

        process.on('exit', code => {
            fs.unlinkSync(tempfile);

            if (code === 0) {
                log('Good job! I am shutting down the server now');
            }
        });

        process.on('SIGINT', () => {
            process.exit(0);
        });
    })
    .command('export', commands.export, options.export, async function (argv) {
        const options = {
            rootpath: path.join(process.cwd(), path.dirname(argv.input)),
            embed: true
        };

        logo();
        newline();
        log(`I will try to export '${argv.input}' to ${argv.format.toUpperCase()}`);
        log('It may take a while since external dependencies are being downloaded and binary files are being embedded');

        await build(argv.input, argv.output, options);

        log(`I managed to export '${argv.input}' to '${argv.output}'`);
        newline();
    })
    .help()
    .strict(true)
    .demandCommand()
    .recommendCommands()
    .argv;
