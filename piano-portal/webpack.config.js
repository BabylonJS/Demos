const path = require("path");
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const appDirectory = fs.realpathSync(process.cwd());

module.exports = (env) => {
    const exports = {
        entry: path.resolve(appDirectory, "src/app.ts"),
        output: {
            path: path.resolve(appDirectory, "dist"),
            filename: 'js/app.js'
        },
        resolve: {
            extensions: [".tsx", ".ts", ".js"]
        },
        devServer: {
            host: '0.0.0.0',
            port: 8080,
            static: path.resolve(appDirectory, "public"),
            hot: false,
            server: "https"
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                }
            ]
        },
        performance: {
            hints: false
        },
        plugins: [
            new CleanWebpackPlugin(),
            new HtmlWebpackPlugin({
                inject: true,
                template: path.resolve(appDirectory, "public/index.html")
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(appDirectory, 'public/skyboxes'),
                        to: path.resolve(appDirectory, 'dist/skyboxes')
                    },
                    {
                        from: path.resolve(appDirectory, 'public/audio.mp3'),
                        to: path.resolve(appDirectory, 'dist/audio.mp3')
                    }
                ]
            })
        ],
        mode: env.mode
    };

    if (env.mode === "development") {
        exports.module.rules.push(
            {
                test: /\.js$/,
                enforce: "pre",
                use: ["source-map-loader"]
            }
        );
        exports.devtool = "inline-source-map"
    }

    return exports;
};
