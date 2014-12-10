-- phpMyAdmin SQL Dump
-- version 4.0.4.1
-- http://www.phpmyadmin.net
--
-- Host: 127.0.0.1
-- Generation Time: Sep 24, 2014 at 03:50 AM
-- Server version: 5.5.32
-- PHP Version: 5.4.19

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `fractals`
--
CREATE DATABASE IF NOT EXISTS `fractals` DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci;
USE `fractals`;

-- --------------------------------------------------------

--
-- Table structure for table `barpattern`
--

DROP TABLE IF EXISTS `barpattern`;
CREATE TABLE IF NOT EXISTS `barpattern` (
  `pattern` varchar(255) NOT NULL,
  `count` int(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `barpattern2`
--

DROP TABLE IF EXISTS `barpattern2`;
CREATE TABLE IF NOT EXISTS `barpattern2` (
  `pattern` varchar(255) NOT NULL,
  `count` int(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `euus_fractal_m5`
--

DROP TABLE IF EXISTS `euus_fractal_m15`;
CREATE TABLE IF NOT EXISTS `euus_fractal_m15` (
  `datetime` int(11) NOT NULL,
  `bar` int(1) NOT NULL,
  `fractal` int(1) NOT NULL,
  `zigzag` int(1) NOT NULL,
  UNIQUE KEY `datetime` (`datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `fractals`
--

DROP TABLE IF EXISTS `fractals`;
CREATE TABLE IF NOT EXISTS `fractals` (
  `pattern` varchar(255) NOT NULL,
  `barCount` int(4) NOT NULL,
  `upOrDown` int(1) NOT NULL,
  `count` int(4) NOT NULL,
  `pos` int(11) NOT NULL,
  `bars` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
